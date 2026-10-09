# Upgrading Carta Cocktail

This guide lists the actions required to upgrade an existing instance, version by version.

1. **Find your version**: the image tag in your `docker-compose.prod.yml` (`backend:1.5.0` is v1.5.0). If you use `:latest` and pulled it before v1.5.0, you run v1.4.0 or older.
2. **Apply the section of every version newer than yours, from the oldest to the newest.** Sections are listed below from the newest to the oldest. A version without a section, or marked "No required action", needs nothing beyond `pull` and `up -d`.
3. **Do the "Before upgrading" actions before pulling the new image.** The new version cannot remind you of them in time: some of them must be done while the old container still runs, and without others the new version may refuse to start. This file is the reference.
4. Then pull and restart, and do the "After upgrading" actions:

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

Pre-releases (`vX.Y.Z-rc.N`) are not listed: they use the section of their target version `vX.Y.Z`. The detailed changes of each version are in its [GitHub Release](https://github.com/Lulu300/carta-cocktail/releases) and in [`docs/releases/`](docs/releases/).

We recommend pinning the images to a version (`:1.6.0`) instead of `:latest`, so that an upgrade only happens when you have read this guide.

The commands below assume the default `docker-compose.prod.yml`, run from its folder. Adapt the file name and the service name `carta-cocktail-backend` if yours differ.

## v1.6.0

**Breaking:** the database schema is now versioned with migrations. On the first start, the backend backs up the database and checks that it matches the first migration, `0_init`: it **refuses to start** if it does not. Check a copy of your database before upgrading (step 3). Release notes: [`docs/releases/v1.6.0.md`](docs/releases/v1.6.0.md).

The database also switches to SQLite WAL mode: while the backend runs, the `db-data` volume holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to `carta_cocktail.db`. Never copy the `.db` file alone while the backend runs.

The volume is named `<project>_db-data`, where `<project>` is the folder of the compose file: `docker volume ls | grep db-data` shows it.

Recommended first: export a backup from Settings > Backup & Restore.

### Before upgrading

1. **Instances on v1.4.x or older: upgrade to v1.5.0 first.** Apply the [v1.5.0 section](#v150) below, start v1.5.0 once and check that it works. v1.5.0 is the last version that aligns the database schema with `db push`; an older schema would not match `0_init`. Then continue with step 2.

2. **Stop the backend and copy the database out of the volume.** Keep this copy until the upgrade is validated:

   ```bash
   docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
   docker volume ls | grep db-data            # gives <project>_db-data
   mkdir -p carta-db-copy
   docker run --rm -v <project>_db-data:/data -v "$PWD/carta-db-copy":/out alpine sh -c 'cp /data/carta_cocktail.db* /out/ && ls -la /out'
   ```

   The backend stays stopped until the upgrade.

3. **Check a copy of the database with the new backend image.** Use a second copy, never the volume itself:

   ```bash
   cp -R carta-db-copy carta-db-check
   docker run -d --name carta-check -v "$PWD/carta-db-check":/app/data \
     -e DATABASE_URL=file:/app/data/carta_cocktail.db -e JWT_SECRET="$(openssl rand -hex 32)" \
     ghcr.io/lulu300/carta-cocktail/backend:1.6.0
   docker logs -f carta-check                         # Ctrl+C after "API running"; on a refusal it ends by itself after the SQL
   docker exec carta-check npx prisma migrate status  # "Database schema is up to date!"
   docker rm -f carta-check
   ls carta-db-check/backups/                         # pre-migrate-<date>.db
   ```

   Expected log: `Database backed up to /app/data/backups/pre-migrate-<date>.db`, `Error: P3005` (normal: the database has no migration history yet), `Existing database matches 0_init: marking it as applied.`, `Migration 0_init marked as applied.`, `Seed completed successfully`, `SQLite journal mode: wal`, `Carta Cocktail API running on port 3001`.

   If the log shows `ERROR: the existing database at /app/data/carta_cocktail.db has no migration history and does not match migration 0_init.`, followed by SQL, the container has stopped: **do not upgrade**. Read the SQL and fix the database first, following "Database migrations" in [`README.md`](README.md#database-migrations).

   On Linux the container writes `carta-db-check/backups/` as root: clean up with `sudo rm -rf carta-db-check`.

   With Node 20 and a checkout of the `v1.6.0` tag, you can also compare the copy with `0_init` without Docker: see "Checking a production database before the first upgrade" in [`README.md`](README.md#checking-a-production-database-before-the-first-upgrade).

   Testing a pre-release (`v1.6.0-rc.N`): the `:1.6.0` image only exists after the final release. Use `ghcr.io/lulu300/carta-cocktail/backend:1.6.0-rc.N` instead (`:1.6.0-rc.1` for the first one).

4. **Pin both images to `:1.6.0`.** `docker-compose.prod.yml` has not changed since v1.5.0: if yours is the v1.5.0 one, only change the image tags. Otherwise, update it first, keeping your own changes (ports, for example):

   ```bash
   cp docker-compose.prod.yml docker-compose.prod.yml.bak
   curl -fsSLo docker-compose.prod.yml https://raw.githubusercontent.com/Lulu300/carta-cocktail/v1.6.0/docker-compose.prod.yml
   ```

   ```yaml
   image: ghcr.io/lulu300/carta-cocktail/backend:1.6.0
   image: ghcr.io/lulu300/carta-cocktail/frontend:1.6.0
   ```

   Testing a pre-release (`v1.6.0-rc.N`): the `v1.6.0` compose URL and the `:1.6.0` images only exist after the final release. Use `v1.6.0-rc.N` in the `curl` URL and pin the images to `:1.6.0-rc.N` instead (`v1.6.0-rc.1` and `:1.6.0-rc.1` for the first one).

5. **Only if the database is on a network share** (a bind mount on an SMB or NFS share, a NAS mount for example): WAL does not work there. In the `docker-compose.prod.yml` from step 4, add `SQLITE_WAL=false` to the existing `environment` list of `carta-cocktail-backend`, for example after `- UPLOAD_DIR=/app/uploads`. The compose files do not pass this variable from `.env`. The default `db-data` named volume is local and needs nothing.

   ```yaml
         - UPLOAD_DIR=/app/uploads
         - SQLITE_WAL=false
   ```

### After upgrading

1. **Check the migration.**

   ```bash
   docker compose -f docker-compose.prod.yml logs carta-cocktail-backend | grep -i "backed up\|0_init\|journal mode\|ERROR"
   docker compose -f docker-compose.prod.yml exec carta-cocktail-backend npx prisma migrate status
   ```

   Expected: `Database backed up to /app/data/backups/pre-migrate-<date>.db`, `Migration 0_init marked as applied.`, `SQLite journal mode: wal` (`delete` with `SQLITE_WAL=false`), and `Database schema is up to date!`. `Error: P3005` is normal on this first start. Open the admin and the public menu. Once everything works, you can delete `carta-db-copy`.

   From now on, the volume holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to the database while the backend runs. Never copy `carta_cocktail.db` alone while the backend runs: use the backup export, or stop the backend and copy all three files.

2. **If something goes wrong, roll back.**
   - **The backend refuses to start** (`ERROR: the existing database … does not match migration 0_init` in the log, container restarting): the database was not modified. Pin the images back to `:1.5.0` and run `docker compose -f docker-compose.prod.yml up -d`, then fix the database as described in "Database migrations" in [`README.md`](README.md#database-migrations) before trying again.
   - **A problem shows after the migration:** pin the images back to `:1.5.0` in `docker-compose.prod.yml`, then restore the copy made before the migration. Changes made since the upgrade are lost. List the copies (the newest is last):

     ```bash
     docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
     docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint ls carta-cocktail-backend -l /app/data/backups/
     ```

     Restore the chosen copy, replacing `<date>` with its date, then start:

     ```bash
     docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint sh carta-cocktail-backend -c '
       B=/app/data/backups/pre-migrate-<date>.db
       cp "$B" /app/data/carta_cocktail.db
       rm -f /app/data/carta_cocktail.db-wal /app/data/carta_cocktail.db-shm
       if [ -f "$B-wal" ]; then cp "$B-wal" /app/data/carta_cocktail.db-wal; fi'
     docker compose -f docker-compose.prod.yml up -d
     ```

     The copy made in step 2 of "Before upgrading" (`carta-db-copy`) holds the same data if the `backups` folder is not available.

## v1.5.0

**Breaking:** the backend no longer starts without a strong `JWT_SECRET`, and existing cocktail photos are deleted by the upgrade unless you copy them first. Release notes: [`docs/releases/v1.5.0.md`](docs/releases/v1.5.0.md).

Recommended first: export a backup from Settings > Backup & Restore. A backup made with the old version contains the database and the photos.

### Before upgrading

1. **Copy the existing photos out of the running backend container.** Older versions store them in `/uploads`, inside the container: pulling the new image and recreating the container deletes them. Do it while the old container is still running:

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker exec "$BACKEND" ls -la /uploads        # the photos to rescue
   docker cp "$BACKEND":/uploads/. ./uploads-rescue/
   ```

   If `/uploads` does not exist, no photo was uploaded since the container was last created: there is nothing to rescue. Photos uploaded before the last container recreation are already lost; restore them from a backup if you have one.

2. **Set `JWT_SECRET` in the `.env` file next to the compose file.** It must be at least 32 characters long and must not be one of the values published in this repository (`default-secret`, `change-me-to-a-random-secret`, `your-random-secret`, `test-secret`). If your `.env` already has a random `JWT_SECRET` of 32 characters or more, keep it.

   ```bash
   JWT_SECRET=<output of: openssl rand -hex 32>
   ```

   For a **new database** only (first start, empty `db-data` volume), also set `ADMIN_PASSWORD` (at least 12 characters, not `admin123`) and, optionally, `ADMIN_EMAIL` (default `admin@carta.local`). On an existing database the admin is kept as is and these two variables are ignored.

3. **Update `docker-compose.prod.yml` to the v1.5.0 version**, keeping your own changes (ports, for example). The new file refuses to start without `JWT_SECRET`, no longer sets `ADMIN_PASSWORD` to `admin123`, and passes `ADMIN_RESET_PASSWORD` to the backend (needed in step 2 of "After upgrading"). Then **pin both images to `:1.5.0`**:

   ```bash
   cp docker-compose.prod.yml docker-compose.prod.yml.bak
   curl -fsSLo docker-compose.prod.yml https://raw.githubusercontent.com/Lulu300/carta-cocktail/v1.5.0/docker-compose.prod.yml
   ```

   ```yaml
   image: ghcr.io/lulu300/carta-cocktail/backend:1.5.0
   image: ghcr.io/lulu300/carta-cocktail/frontend:1.5.0
   ```

   Testing a pre-release (`v1.5.0-rc.N`): the `v1.5.0` compose URL and the `:1.5.0` images only exist after the final release. Use `v1.5.0-rc.N` in the `curl` URL and pin the images to `:1.5.0-rc.N` instead.

### After upgrading

1. **Copy the rescued photos into the uploads volume.** The container was recreated, so read its id again:

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker cp ./uploads-rescue/. "$BACKEND":/app/uploads/
   docker exec "$BACKEND" ls -la /app/uploads
   ```

   No restart is needed. Check that the photos show on a cocktail page, then delete `./uploads-rescue/`. The photos now survive container recreations.

2. **Change the admin password if it is still `admin123`.** Older versions reset the password to `ADMIN_PASSWORD` at every start, or to `admin123` when `ADMIN_PASSWORD` was not set, even after a change in the settings. If you never set `ADMIN_PASSWORD`, your password is `admin123`, and the backend log says so at each start. Log in (the new `JWT_SECRET` ended the previous sessions), then either:
   - change it in Settings > Admin Profile; it now survives restarts and updates; or
   - set `ADMIN_RESET_PASSWORD=true` and a new `ADMIN_PASSWORD` (at least 12 characters) in `.env`, run `docker compose -f docker-compose.prod.yml up -d`, check the log line `Admin credentials reset from environment (login email: …)`, then remove `ADMIN_RESET_PASSWORD` from `.env` and run `up -d` again. Otherwise every restart resets the password.

3. **Assign the cocktails to their sections again.** Saving a cocktail menu with an older version moved every cocktail back to "Without a section", and these assignments cannot be recovered. In Admin > Menus, open each cocktail menu that uses sections and assign its cocktails again. From this version on, sections are kept.
