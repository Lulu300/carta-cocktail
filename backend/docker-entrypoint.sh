#!/bin/sh
# Container entrypoint: back up the SQLite database, apply the versioned Prisma
# migrations, seed, then replace this shell with Node so that it receives SIGTERM.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set, for example file:/app/data/carta_cocktail.db}"

cd "$(dirname "$0")"

BASELINE_MIGRATION=0_init
MAX_BACKUPS=10

# Prisma resolves a relative SQLite path from the schema folder, not from the
# working directory.
resolve_db_file() {
  path="${DATABASE_URL#file:}"
  path="${path%%\?*}"
  case "$path" in
    /*) echo "$path" ;;
    *) echo "$PWD/prisma/${path#./}" ;;
  esac
}

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

backup_database() {
  if is_unchanged_since_latest_backup; then
    echo "Database unchanged since backup $(latest_backup), no new backup."
    return
  fi
  mkdir -p "$BACKUP_DIR"
  backup="$BACKUP_DIR/pre-migrate-$(date +%Y%m%d-%H%M%S).db"
  for suffix in "" -wal -shm; do
    if [ -f "$DB_FILE$suffix" ]; then
      cp -p "$DB_FILE$suffix" "$backup$suffix"
    fi
  done
  echo "Database backed up to $backup"
  prune_backups
}

refuse_baseline() {
  baseline_db="$1"
  {
    echo "ERROR: the existing database at $DB_FILE has no migration history and does not match migration $BASELINE_MIGRATION."
    echo "The backend will not start, and the database was not modified. A copy is in $BACKUP_DIR."
    echo "SQL that would bring the database to $BASELINE_MIGRATION (for review only, do not run it blindly):"
    npx prisma migrate diff --from-url "file:$DB_FILE" --to-url "file:$baseline_db" --script || true
    echo "Follow the manual baseline procedure in README.md (section \"Database migrations\")."
  } >&2
  rm -f "$baseline_db"
  exit 1
}

# Databases created by `prisma db push` (v1.5.0 and older) have tables but no
# migration history. Mark the first migration as applied only when the schema
# is exactly the one it would create, then apply the newer migrations.
baseline_existing_database() {
  baseline_db="/tmp/carta-baseline-$$.db"
  rm -f "$baseline_db"
  npx prisma db execute --url "file:$baseline_db" --file "prisma/migrations/$BASELINE_MIGRATION/migration.sql" >/dev/null

  diff_status=0
  npx prisma migrate diff --from-url "file:$DB_FILE" --to-url "file:$baseline_db" --exit-code >/dev/null || diff_status=$?
  if [ "$diff_status" -ne 0 ]; then
    refuse_baseline "$baseline_db"
  fi
  rm -f "$baseline_db"

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

# `migrate status` fails when migrations are pending or the database has no
# migration history: the two cases where the next step may change it.
if [ -f "$DB_FILE" ] && ! npx prisma migrate status; then
  backup_database
fi

apply_migrations
npm run db:seed
exec node dist/index.js
