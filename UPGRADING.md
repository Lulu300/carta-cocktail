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

We recommend pinning the images to a version (`:1.5.0`) instead of `:latest`, so that an upgrade only happens when you have read this guide.

The commands below assume the default `docker-compose.prod.yml`, run from its folder. Adapt the file name and the service name `carta-cocktail-backend` if yours differ.

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
