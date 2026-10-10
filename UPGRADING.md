# Upgrading Carta Cocktail

This guide lists the actions required to upgrade an existing instance, version by version.

1. **Find your version**: the image tag in your `docker-compose.prod.yml` (`backend:1.5.0` is v1.5.0). If you use `:latest` and pulled it before v1.5.0, you run v1.4.0 or older.
2. **Apply the section of every version newer than yours, from the oldest to the newest.** Sections are listed below from the newest to the oldest. A version without a section, or marked "No required action", needs nothing beyond `pull` and `up -d`. You can skip the intermediate versions only where a section says so (from v1.4.x straight to v1.6.0, for example), and their actions still apply.
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

**Breaking:** the database schema is now versioned with migrations. On the first start, the backend backs up the database and checks that it matches the first migration, `0_init`: it **refuses to start** if it does not. Check a copy of your database before upgrading (step 4). Release notes: [`docs/releases/v1.6.0.md`](docs/releases/v1.6.0.md).

The database also switches to SQLite WAL mode: while the backend runs, the `db-data` volume holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to `carta_cocktail.db`. Never copy the `.db` file alone while the backend runs.

The volume is named `<project>_db-data`, where `<project>` is the folder of the compose file: `docker volume ls | grep db-data` shows it. A database in a folder of the host (`./data:/app/data`) is covered in step 3.

Recommended first: export a backup from Settings > Backup & Restore.

### Before upgrading

1. **Instances on v1.4.x or older: apply the v1.5.0 actions too.** The simplest path: apply the [v1.5.0 section](#v150) below, start v1.5.0 once and check that it works, then continue with step 2.

   From v1.4.x, you can also upgrade straight to v1.6.0: the database schema did not change between v1.4.0 and v1.5.0, so the database matches `0_init`. The v1.5.0 actions are still required. Do the v1.5.0 "Before upgrading" actions first, pinning the images to `:1.6.0` (step 5 below) instead of `:1.5.0`, then steps 3 to 6 below (skip step 2: the v1.5.0 actions already handle the photos). After the upgrade, do the v1.5.0 "After upgrading" actions as well as the ones below.

   Older instances must go through v1.5.0: it is the last version that aligns the database schema with `db push` before the `0_init` check.

2. **Check that the photos are on a mount.** On the running v1.5.0 instance, list the mounts of the backend:

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker inspect "$BACKEND" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}'
   ```

   One line must end with `-> /app/uploads` (or with the path in `UPLOAD_DIR`, if you set it). With the default compose file, it is the `uploads` volume: nothing to do.

   **If no line ends with `-> /app/uploads`**, the photos are inside the container, and replacing it with the v1.6.0 one deletes them. This happens to instances that mounted their photos on `/uploads` and followed the first version of the v1.5.0 notes, which copied them into the container. While the container still runs, copy them out:

   ```bash
   docker cp "$BACKEND":/app/uploads/. ./uploads-rescue/
   ls ./uploads-rescue
   ```

   Then, in step 5, mount the photo folder on `/app/uploads` as described in step 3 of the [v1.5.0 section](#v150) ("Photos mounted on `/uploads`"), and copy the photos back after the upgrade (step 2 of "After upgrading").

3. **Stop the backend and copy the database out of the volume.** Keep this copy until the upgrade is validated:

   ```bash
   docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
   docker volume ls | grep db-data            # gives <project>_db-data
   mkdir -p carta-db-copy
   docker run --rm -v <project>_db-data:/data -v "$PWD/carta-db-copy":/out alpine sh -c 'cp /data/carta_cocktail.db* /out/ && ls -la /out'
   ```

   **Database in a folder of the host** (a bind mount such as `./data:/app/data`: the `docker inspect` command of step 2 (or of step 1 of the v1.5.0 section) prints `bind <folder> -> /app/data`): there is no volume, copy the files from that folder instead, with the backend stopped:

   ```bash
   docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
   mkdir -p carta-db-copy
   cp ./data/carta_cocktail.db* carta-db-copy/ && ls -la carta-db-copy
   ```

   Replace `./data` with your folder. If `cp` answers `Permission denied` (files created by the container belong to root), copy through a container:

   ```bash
   docker run --rm -v "$PWD/data":/data -v "$PWD/carta-db-copy":/out alpine sh -c 'cp /data/carta_cocktail.db* /out/ && ls -la /out'
   ```

   In both cases, the backend stays stopped until the upgrade, and the next steps use `carta-db-copy`.

4. **Check a copy of the database with the new backend image.** Use a second copy, never the volume or the data folder itself:

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

5. **Pin both images to `:1.6.0`.** `docker-compose.prod.yml` has not changed since v1.5.0: if yours is the v1.5.0 one, only change the image tags. Otherwise, update it first, keeping your own changes (ports, for example, and the changes of step 3 of the v1.5.0 section: photos mounted on `/app/uploads`, secrets in an `env_file`):

   ```bash
   cp docker-compose.prod.yml docker-compose.prod.yml.bak
   curl -fsSLo docker-compose.prod.yml https://raw.githubusercontent.com/Lulu300/carta-cocktail/v1.6.0/docker-compose.prod.yml
   ```

   ```yaml
   image: ghcr.io/lulu300/carta-cocktail/backend:1.6.0
   image: ghcr.io/lulu300/carta-cocktail/frontend:1.6.0
   ```

   Testing a pre-release (`v1.6.0-rc.N`): the `v1.6.0` compose URL and the `:1.6.0` images only exist after the final release. Use `v1.6.0-rc.N` in the `curl` URL and pin the images to `:1.6.0-rc.N` instead (`v1.6.0-rc.1` and `:1.6.0-rc.1` for the first one).

6. **Only if the database is on a network share** (a bind mount on an SMB or NFS share, a NAS mount for example): WAL does not work there. In the `docker-compose.prod.yml` from step 5, add `SQLITE_WAL=false` to the existing `environment` list of `carta-cocktail-backend`, for example after `- UPLOAD_DIR=/app/uploads`. The compose files do not pass this variable from `.env`. The default `db-data` named volume is local and needs nothing.

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

   From now on, the volume (or the data folder) holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to the database while the backend runs. Never copy `carta_cocktail.db` alone while the backend runs: use the backup export, or stop the backend and copy all three files.

2. **Only if you rescued photos in step 2 of "Before upgrading": copy them back, then check the photos.**

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker inspect "$BACKEND" --format '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' | grep -x /app/uploads && docker cp ./uploads-rescue/. "$BACKEND":/app/uploads/
   PHOTO=$(docker exec "$BACKEND" ls /app/uploads | head -n 1)
   docker exec "$BACKEND" wget -q --spider "http://localhost:3001/uploads/$PHOTO" && echo "photo served"
   ```

   The second command must print `/app/uploads`, and only then copies the photos. If it prints nothing, `/app/uploads` is not a mount and nothing was copied: fix the mount (step 5 of "Before upgrading"), run `docker compose -f docker-compose.prod.yml up -d`, then run these commands again. The last line must print `photo served`. Check that the photos show on a cocktail page, then delete `./uploads-rescue/`.

3. **If something goes wrong, roll back.**
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

     The copy made in step 3 of "Before upgrading" (`carta-db-copy`) holds the same data if the `backups` folder is not available.

## v1.5.0

**Breaking:** the backend no longer starts without a strong `JWT_SECRET`, and existing cocktail photos are deleted by the upgrade unless you copy them first (or, if your compose file mounts them on `/uploads`, move the mount to `/app/uploads`). Release notes: [`docs/releases/v1.5.0.md`](docs/releases/v1.5.0.md).

Recommended first: export a backup from Settings > Backup & Restore. A backup made with the old version contains the database and the photos.

### Before upgrading

1. **Find where the photos are, and copy them out of the running backend container if they are inside it.** Older versions write them to `/uploads` in the container. List the mounts of the running backend:

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker inspect "$BACKEND" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}'
   ```

   - **No line ends with `-> /uploads`** (the default compose file only mounts `/app/data` and `/app/uploads`): the photos are inside the container, and pulling the new image and recreating the container deletes them. Copy them out while the old container is still running:

     ```bash
     docker exec "$BACKEND" ls -la /uploads        # the photos to rescue
     docker cp "$BACKEND":/uploads/. ./uploads-rescue/
     ```

     If `/uploads` does not exist, no photo was uploaded since the container was last created: there is nothing to rescue. Photos uploaded before the last container recreation are already lost; restore them from a backup if you have one.

   - **A line ends with `-> /uploads`** (your compose file mounts a folder or a volume there, `./uploads:/uploads` for example): the photos are in that folder or volume and survive the upgrade. **Do not copy them with `docker cp`.** The new version reads and writes photos in `/app/uploads`, so the mount has to move in step 3 ("Photos mounted on `/uploads`"). Copied into the container instead, the photos would show at first, then disappear at the next container recreation, at the latest with the next update.

2. **Set `JWT_SECRET` in the `.env` file next to the compose file.** It must be at least 32 characters long and must not be one of the values published in this repository (`default-secret`, `change-me-to-a-random-secret`, `your-random-secret`, `test-secret`). If your `.env` already has a random `JWT_SECRET` of 32 characters or more, keep it.

   ```bash
   JWT_SECRET=<output of: openssl rand -hex 32>
   ```

   For a **new database** only (first start, empty `db-data` volume), also set `ADMIN_PASSWORD` (at least 12 characters, not `admin123`) and, optionally, `ADMIN_EMAIL` (default `admin@carta.local`). On an existing database the admin is kept as is and these two variables are ignored: an `ADMIN_PASSWORD` shorter than 12 characters already in `.env` does not stop the upgraded backend from starting. Step 2 of "After upgrading" deals with it.

   If your compose file reads the secrets from another file with `env_file:`, put `JWT_SECRET` in that file instead, and read step 3 ("Secrets in an `env_file`").

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

   Two custom setups need more than that. With the default compose file and a `.env` file, skip them.

   - **Photos mounted on `/uploads`** (second case of step 1). Mount the same folder or volume on `/app/uploads` instead, in place of the `- uploads:/app/uploads` line of the new file:

     ```yaml
         volumes:
           - ./uploads:/app/uploads      # was ./uploads:/uploads
     ```

     The other option is to keep your mount and set `UPLOAD_DIR` to its path, by changing the `- UPLOAD_DIR=/app/uploads` line of the backend `environment` list (`- UPLOAD_DIR=/uploads`). The compose file sets this variable itself, so a value in `.env` has no effect. The mounted path and `UPLOAD_DIR` must always be the same. Prefer the first option: the commands of this guide use `/app/uploads`.

   - **Secrets in an `env_file`** (a file other than `.env`, named in an `env_file:` entry of the backend). The `- JWT_SECRET=${JWT_SECRET:?…}` and `- ADMIN_PASSWORD=${ADMIN_PASSWORD:-}` lines of the new file take their values from `.env` or from the shell, never from `env_file`, and a variable set in `environment` wins over the same variable in `env_file`. Copied as they are, the first line stops `docker compose` when `.env` has no `JWT_SECRET` (`required variable JWT_SECRET is missing a value`), and the second replaces your `ADMIN_PASSWORD` with an empty value. Keep your secrets in your `env_file` and do not copy these two lines. The same goes for the `ADMIN_EMAIL` line if you set `ADMIN_EMAIL` in your `env_file`. Wherever this guide says `.env` for `JWT_SECRET`, `ADMIN_PASSWORD` or `ADMIN_EMAIL`, use your `env_file`. Keep the `- ADMIN_RESET_PASSWORD=${ADMIN_RESET_PASSWORD:-false}` line as it is: it reads `.env` or the shell, so `ADMIN_RESET_PASSWORD` always goes there, never in your `env_file`, where the line would replace it with `false` (step 2 of "After upgrading").

### After upgrading

1. **Check that `/app/uploads` is a mount, copy the rescued photos into it, then check that a photo is served.** The container was recreated, so read its id again:

   ```bash
   BACKEND=$(docker compose -f docker-compose.prod.yml ps -q carta-cocktail-backend)
   docker inspect "$BACKEND" --format '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' | grep -x /app/uploads && docker cp ./uploads-rescue/. "$BACKEND":/app/uploads/
   docker exec "$BACKEND" ls -la /app/uploads
   PHOTO=$(docker exec "$BACKEND" ls /app/uploads | head -n 1)
   docker exec "$BACKEND" wget -q --spider "http://localhost:3001/uploads/$PHOTO" && echo "photo served"
   ```

   No restart is needed. Photos mounted on `/uploads` before the upgrade (second case of step 1 of "Before upgrading") were not rescued: leave out the `&& docker cp …` part of the second command, they are already in the folder now mounted on `/app/uploads`.

   The second command must print `/app/uploads`, and only then copies the photos. The last one must print `photo served` (skip the last two on an instance without any photo). If the second command prints nothing, `/app/uploads` is not a mount and nothing was copied: fix the mount (step 3 of "Before upgrading"), run `docker compose -f docker-compose.prod.yml up -d`, then run these commands again. With `UPLOAD_DIR=/uploads`, replace `/app/uploads` with `/uploads` in these commands, except in the URL. Then check that the photos show on a cocktail page, and delete `./uploads-rescue/`. The photos now survive container recreations.

2. **Change the admin password if it is still `admin123`, or shorter than 12 characters.** Older versions reset the password to `ADMIN_PASSWORD` at every start, or to `admin123` when `ADMIN_PASSWORD` was not set, even after a change in the settings. If you never set `ADMIN_PASSWORD`, your password is `admin123`, and the backend log says so at each start. Log in (the new `JWT_SECRET` ended the previous sessions), then either:
   - change it in Settings > Admin Profile; it now survives restarts and updates; or
   - set `ADMIN_RESET_PASSWORD=true` and a new `ADMIN_PASSWORD` (at least 12 characters) in `.env`, run `docker compose -f docker-compose.prod.yml up -d`, check the log line `Admin credentials reset from environment (login email: …)`, then remove `ADMIN_RESET_PASSWORD` from `.env` and run `up -d` again. Otherwise every restart resets the password. With an `env_file` (step 3 of "Before upgrading"), put the new `ADMIN_PASSWORD` in your `env_file`, but `ADMIN_RESET_PASSWORD=true` in `.env`, or run `ADMIN_RESET_PASSWORD=true docker compose -f docker-compose.prod.yml up -d` once and then a plain `up -d`: set in the `env_file`, it is replaced by `false` and the reset silently does not happen.

   If `.env` sets an `ADMIN_PASSWORD` shorter than 12 characters, it is your current password, for the same reason. The new version starts with it, because an existing admin is left as is, but refuses it to create or reset the admin. Change the password in Settings > Admin Profile, choosing at least 12 characters, then remove `ADMIN_PASSWORD` from `.env` or set it to at least 12 characters.

3. **Assign the cocktails to their sections again.** Saving a cocktail menu with an older version moved every cocktail back to "Without a section", and these assignments cannot be recovered. In Admin > Menus, open each cocktail menu that uses sections and assign its cocktails again. From this version on, sections are kept.
