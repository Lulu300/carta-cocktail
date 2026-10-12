#!/bin/sh
# Container entrypoint: give the data folders to the node user and drop root,
# then back up the SQLite database, apply the versioned Prisma migrations, seed,
# and replace this shell with Node so that it receives SIGTERM (through tini).
# A command given to the container (`docker compose run … sh`) runs as the node
# user instead of those startup steps.
set -eu

cd "$(dirname "$0")"

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

# Earlier images ran as root, so the files they wrote in the volumes belong
# to root. Only the files the node user does not own yet are changed: after the
# first start, this is a quick scan. Files written as root later (a restore run
# with `--entrypoint sh`) are fixed at the next start.
give_to_node() {
  dir="$1"
  if [ ! -d "$dir" ] || [ "$dir" = / ]; then
    return
  fi
  # A network share (SMB, NFS) may refuse chown: the application may still be
  # able to write there, so warn and let it try.
  if ! find "$dir" ! -user node -exec chown -h node:node {} +; then
    echo "WARNING: could not give $dir to the node user (uid 1000). If the backend cannot write there, run: chown -R 1000:1000 <folder mounted on $dir>" >&2
  fi
}

if [ "$(id -u)" = 0 ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    give_to_node "$(dirname "$(resolve_db_file)")"
  fi
  give_to_node "${UPLOAD_DIR:-/app/uploads}"
  exec su-exec node "$0" "$@"
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

: "${DATABASE_URL:?DATABASE_URL must be set, for example file:/app/data/carta_cocktail.db}"

DB_FILE="$(resolve_db_file)"
BACKUP_DIR="$(dirname "$DB_FILE")/backups"

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

  echo "Existing database matches $BASELINE_MIGRATION: marking it as applied."
  npx prisma migrate resolve --applied "$BASELINE_MIGRATION"
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

# SQLite migrations are not transactional: one stopped halfway is marked as
# failed, and every later start refuses to go on (P3009). A stop request (tini
# forwards SIGTERM to this shell only) waits for the current command to end,
# then the container exits before the seed. Docker still kills it after its
# stop timeout (10 s by default).
stop_requested=false
trap 'stop_requested=true' TERM INT

# `migrate status` fails when migrations are pending or the database has no
# migration history: the two cases where the next step may change it.
if [ -f "$DB_FILE" ] && ! npx prisma migrate status; then
  backup_database
fi

apply_migrations

if [ "$stop_requested" = true ]; then
  echo "Stop requested during the database update: exiting before the seed."
  exit 143
fi
trap - TERM INT

node dist/scripts/seed.js
exec node dist/index.js
