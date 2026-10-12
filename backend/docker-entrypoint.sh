#!/bin/sh
# Container entrypoint, run as the node user: check that the data folders are
# writable, back up the SQLite database, apply the versioned Prisma migrations,
# seed, then replace this shell with Node so that it receives SIGTERM (through
# tini). A command given to the container (`docker compose run … sh`) runs
# instead of those startup steps.
set -eu

cd "$(dirname "$0")"

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

: "${DATABASE_URL:?DATABASE_URL must be set, for example file:/app/data/carta_cocktail.db}"

BASELINE_MIGRATION=0_init
MAX_BACKUPS=10

# Same rule as src/lib/databasePath.ts, which the application and the Prisma CLI
# (prisma.config.ts) use: a relative SQLite path starts from the schema folder,
# not from the working directory.
resolve_db_file() {
  path="${DATABASE_URL#file:}"
  path="${path%%\?*}"
  case "$path" in
    /*) echo "$path" ;;
    *) echo "$PWD/prisma/${path#./}" ;;
  esac
}

DB_FILE="$(resolve_db_file)"
DB_DIR="$(dirname "$DB_FILE")"
BACKUP_DIR="$DB_DIR/backups"
UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

refuse_unwritable() {
  owner="$(id -u):$(id -g)"
  {
    echo "ERROR: the backend runs as uid $(id -u) and cannot write to $1."
    echo "Images before this version ran as root, so the files of an existing install belong to root."
    echo "The folder may also belong to another uid (see \`user:\` in the compose file), or be mounted read-only."
    echo "Stop the backend, give the volume or host folder mounted on $2 to $owner (mounted read-write), then start again:"
    echo "  named volume: docker run --rm -v <volume>:/data alpine chown -R $owner /data"
    echo "  host folder:  sudo chown -R $owner <host folder>"
    echo "See the required actions of this version in UPGRADING.md."
  } >&2
  exit 1
}

# Real write tests: busybox `test -w` only compares mode bits, so it misses
# read-only mounts, ACLs and the uid mapping of network shares. They change
# nothing and leave nothing behind.
can_write_dir() {
  probe="$(mktemp -p "$1" .write-test.XXXXXX 2>/dev/null)" && rm -f "$probe"
}

# Opens the file for appending and writes nothing: content and mtime unchanged.
can_write_file() {
  (: >>"$1") 2>/dev/null
}

# require_writable <mount point> <path>...: every existing folder or file must be
# writable. Without this check, the first write fails later, deep inside Prisma
# or SQLite, or only when a photo is uploaded.
require_writable() {
  mount_point="$1"
  shift
  for path in "$@"; do
    if [ -d "$path" ]; then
      can_write_dir "$path" || refuse_unwritable "$path" "$mount_point"
    elif [ -e "$path" ]; then
      can_write_file "$path" || refuse_unwritable "$path" "$mount_point"
    fi
  done
}

# A backup restore renames the folders directly in UPLOAD_DIR: a subfolder left
# to root by a non-recursive chown would make it fail. Photos only need their
# folder to be writable.
require_writable_upload_dirs() {
  find "$UPLOAD_DIR" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
    require_writable "$UPLOAD_DIR" "$dir"
  done
}

# SQLite migrations are not transactional: one stopped halfway is marked as
# failed, and every later start refuses to go on (P3009). A stop request (tini
# forwards SIGTERM to this shell only) lets the running command finish and
# starts no new step. Docker still kills the container after its stop timeout
# (10 s by default).
stop_status=
trap 'stop_status=143' TERM
trap 'stop_status=130' INT

exit_if_stop_requested() {
  if [ -n "$stop_status" ]; then
    echo "Stop requested: exiting before $1."
    exit "$stop_status"
  fi
}

latest_backup() {
  ls -1 "$BACKUP_DIR"/pre-migrate-*.db 2>/dev/null | sort -r | head -n 1
}

# A container that fails to start is restarted in a loop: without this check,
# each attempt would add a copy and push the last good backup out of rotation.
is_unchanged_since_latest_backup() {
  latest="$(latest_backup)"
  [ -n "$latest" ] || return 1
  for suffix in "" -wal; do
    if [ -f "$DB_FILE$suffix" ] || [ -f "$latest$suffix" ]; then
      cmp -s "$DB_FILE$suffix" "$latest$suffix" || return 1
    fi
  done
}

prune_backups() {
  # Backup names embed the date, so a reverse name sort lists the newest first.
  ls -1 "$BACKUP_DIR"/pre-migrate-*.db | sort -r | tail -n "+$((MAX_BACKUPS + 1))" |
    while read -r old; do
      rm -f "$old" "$old-wal" "$old-shm"
    done
}

backup_name_is_taken() {
  [ -e "$1" ] || [ -e "$1-wal" ] || [ -e "$1-shm" ]
}

# Two starts in the same second would get the same name and overwrite the
# previous copy (or pair it with another copy's -wal): wait for a free name.
# Names stay date-ordered, as latest_backup and prune_backups expect.
new_backup_name() {
  name="$BACKUP_DIR/pre-migrate-$(date +%Y%m%d-%H%M%S).db"
  while backup_name_is_taken "$name"; do
    sleep 1
    name="$BACKUP_DIR/pre-migrate-$(date +%Y%m%d-%H%M%S).db"
  done
  echo "$name"
}

backup_database() {
  if is_unchanged_since_latest_backup; then
    echo "Database unchanged since backup $(latest_backup), no new backup."
    return
  fi
  mkdir -p "$BACKUP_DIR"
  backup="$(new_backup_name)"
  for suffix in "" -wal -shm; do
    if [ -f "$DB_FILE$suffix" ]; then
      cp -p "$DB_FILE$suffix" "$backup$suffix"
    fi
  done
  echo "Database backed up to $backup"
  prune_backups
}

refuse_baseline() {
  baseline_dir="$1"
  {
    echo "ERROR: the existing database at $DB_FILE has no migration history and does not match migration $BASELINE_MIGRATION."
    echo "The backend will not start, and its data and schema were not modified. A copy is in $BACKUP_DIR."
    echo "SQL that would bring the database to $BASELINE_MIGRATION (for review only, do not run it blindly):"
    npx prisma migrate diff --from-config-datasource --to-migrations "$baseline_dir" --script || true
    echo "Follow the manual baseline procedure in README.md (section \"Database migrations\")."
  } >&2
  rm -rf "$baseline_dir"
  exit 1
}

# Databases created by `prisma db push` (v1.5.0 and older) have tables but no
# migration history. Mark the first migration as applied only when the schema
# is exactly the one it would create, then apply the newer migrations.
baseline_existing_database() {
  # A migrations folder that holds the baseline alone. `migrate diff` replays it
  # on an in-memory shadow database and only reads the database (DATABASE_URL).
  baseline_dir="$(mktemp -d)"
  cp -R "prisma/migrations/$BASELINE_MIGRATION" prisma/migrations/migration_lock.toml "$baseline_dir/"

  diff_status=0
  npx prisma migrate diff --from-config-datasource --to-migrations "$baseline_dir" --exit-code >/dev/null || diff_status=$?
  if [ "$diff_status" -ne 0 ]; then
    refuse_baseline "$baseline_dir"
  fi
  rm -rf "$baseline_dir"

  exit_if_stop_requested "marking $BASELINE_MIGRATION as applied"
  echo "Existing database matches $BASELINE_MIGRATION: marking it as applied."
  npx prisma migrate resolve --applied "$BASELINE_MIGRATION"
  exit_if_stop_requested "the migrations after $BASELINE_MIGRATION"
  npx prisma migrate deploy
}

apply_migrations() {
  deploy_status=0
  deploy_output="$(npx prisma migrate deploy 2>&1)" || deploy_status=$?
  echo "$deploy_output"
  if [ "$deploy_status" -eq 0 ]; then
    return
  fi
  # P3005: the database is not empty but has no migration history.
  if echo "$deploy_output" | grep -q P3005; then
    baseline_existing_database
  else
    exit "$deploy_status"
  fi
}

require_writable "$DB_DIR" "$DB_DIR" "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm" "$BACKUP_DIR"
require_writable "$UPLOAD_DIR" "$UPLOAD_DIR"
require_writable_upload_dirs || exit 1

# `migrate status` fails when migrations are pending or the database has no
# migration history: the two cases where the next step may change it.
if [ -f "$DB_FILE" ] && ! npx prisma migrate status; then
  exit_if_stop_requested "the backup"
  backup_database
fi

exit_if_stop_requested "the migrations"
apply_migrations
exit_if_stop_requested "the seed"
trap - TERM INT

node dist/scripts/seed.js
exec node dist/index.js
