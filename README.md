# Carta Cocktail

A cocktail menu management system with admin panel and public-facing menu display. Manage cocktail recipes, bottle inventory, ingredient stock, and publishable menus.

## Features

- **Cocktail recipes** with multi-source ingredients (specific bottle, category, or free ingredient), step-by-step instructions, and image upload
- **Bottle inventory** tracking capacity, remaining percentage, opened date, alcohol %, and storage location
- **Category management** with dynamic types (Spirit, Syrup, Soft, custom) and configurable colors
- **Stock monitoring** with shortage alerts and availability calculation per cocktail
- **Menu system** with cocktail and bottle menus, sections, drag-to-reorder, and public/private visibility
- **Import/Export** cocktails as JSON or batch ZIP with smart dependency resolution
- **Multi-language** UI (English / French) with i18next
- **Public pages** for displaying menus and cocktail details to guests
- **API tokens** for scripts and MCP clients: named, read-only or read and write, expiring, revocable one by one in Settings (`docs/operations.md`, "Jetons d'API")
- **MCP server** at `/api/mcp` for AI agents (Claude Code, Claude Desktop, Code Mode clients): typed tools over the API, read-only or read and write with the scope of the API token, and optionally Code Mode's `search` and `execute`, run in a sandbox on the server ([MCP server](#mcp-server))

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Express 5, TypeScript, Prisma 7, SQLite |
| Frontend | React 19, Vite 8, TailwindCSS 4, React Router 7 |
| Auth | JWT (single admin) |
| i18n | i18next |
| Deploy | Docker Compose |
| CI/CD | GitHub Actions, ghcr.io |

## Quick Start

### Prerequisites

- Node.js 26 or newer (`.nvmrc`; `nvm use` picks it up), required by `engines` in both packages
- npm

### Development

```bash
# Clone
git clone https://github.com/lulu300/carta-cocktail.git
cd carta-cocktail

# Backend
cd backend
cp ../.env.example .env
# Edit .env before seeding:
#   JWT_SECRET     -> output of: openssl rand -hex 32
#   ADMIN_PASSWORD -> a password of at least 12 characters
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
# API running at http://localhost:3001

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `.env`. There are no default credentials: the backend refuses to start without a strong `JWT_SECRET`, and the seed refuses to create the admin without a valid `ADMIN_PASSWORD`.

### Running Tests

Tests are **required** to pass for CI. Every pull request and push to `main`/`develop` runs the full test suite.

```bash
# Backend tests (integration tests with real SQLite test database)
cd backend
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report

# Frontend tests (unit tests with jsdom)
cd frontend
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

The backend tests use a dedicated `test.db` SQLite database, created and destroyed automatically. No manual setup needed.

### Docker (local build)

Create a `.env` file next to the compose file first (see the required variables below), then:

```bash
docker compose up --build
```

- Frontend: `http://localhost` (port 80)
- Backend API: `http://localhost:3001`

The backend image holds the release notes of `docs/releases/`, for the upgrade guide shown in the admin after an upgrade. They sit outside the backend build context, so the build receives them as a named context: `docker-compose.yml` passes it (`additional_contexts`, Docker Compose 2.17 or later). A compose file of your own that builds the backend image needs the same `additional_contexts: { releases: ./docs/releases }` under `build:`. A manual build passes it too, from the repository root, otherwise Docker looks for an image named `releases`:

```bash
docker build --build-context releases=./docs/releases -t carta-cocktail-backend ./backend
```

### Docker (production with pre-built images)

> **Warning:** set `JWT_SECRET` and `ADMIN_PASSWORD` before exposing the app to the Internet. `docker compose` refuses to start without `JWT_SECRET`, and the backend refuses a secret shorter than 32 characters or a known default.

Use `docker-compose.prod.yml` to deploy with pre-built images from GitHub Container Registry. The operations guide, [`docs/operations.md`](docs/operations.md) (in French), covers installation, backups, upgrades, rollback, secret rotation and HTTPS step by step.

1. **Pin a version.** In `docker-compose.prod.yml`, replace `:latest` with a version, so that an upgrade only happens after you have read [`UPGRADING.md`](UPGRADING.md). `:<major>.<minor>` (from v1.12.0, such as `:1.20`) follows the patch releases of that minor version; `:<major>.<minor>.<patch>` never moves:

   ```yaml
   image: ghcr.io/lulu300/carta-cocktail/backend:1.20
   image: ghcr.io/lulu300/carta-cocktail/frontend:1.20
   ```

2. **Create a `.env` file** alongside the compose file, before the first start:

   ```bash
   JWT_SECRET=<output of: openssl rand -hex 32>   # required, at least 32 characters
   ADMIN_EMAIL=admin@yourbar.com
   ADMIN_PASSWORD=<at least 12 characters>        # required on first start
   ```

3. **Pull and start:**

   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --wait
   ```

`ADMIN_PASSWORD` is only used to create the admin on first start. After that, change the password from Settings > Admin Profile: it survives restarts and image updates. Changing `JWT_SECRET` logs out existing sessions; it does not touch data.

Behind a reverse proxy that reaches the frontend container directly, target port **8080**: nginx runs as a non-root user and listens there. It is the only port the image declares, so a proxy that picks the container port by itself finds it.

The changes of each version are in the [GitHub Releases](https://github.com/Lulu300/carta-cocktail/releases) and in [`docs/releases/`](docs/releases/).

#### Upgrading

Some versions require actions before or after the upgrade (new variables in `.env`, files to copy out of the old container…). **Read [`UPGRADING.md`](UPGRADING.md) before pulling a new version**, and apply the sections of every version newer than yours, in order. Upgrading from v1.4.0 or older to v1.5.0 requires a `JWT_SECRET` and a copy of the existing cocktail photos. Upgrading to v1.12.0 requires giving the data folders to uid 1000 first (see below).

#### Data folders and the node user

By default, the backend runs as the `node` user (uid 1000, gid 1000), never as root. The named volumes of the compose files need nothing: Docker gives a new volume the owner of the image folder. Host folders mounted on `/app/data` and `/app/uploads` must belong to uid 1000, or to the uid and gid set with `CARTA_UID` and `CARTA_GID` (see below). Create them before the first start:

```bash
mkdir -p data uploads && sudo chown 1000:1000 data uploads
```

Versions before v1.12.0 ran as root, so the volumes and folders of an existing install belong to root: follow the [v1.12.0 section of `UPGRADING.md`](UPGRADING.md#v1120). If a folder is not writable, the backend stops at startup with the `chown` command to run.

**Another uid and gid.** The compose files run the backend as `${CARTA_UID:-1000}:${CARTA_GID:-1000}`. Set both variables in the `.env` file next to the compose file when the data folders must belong to another owner, then recreate the backend (`docker compose -f docker-compose.prod.yml up -d`):

```bash
CARTA_UID=1026
CARTA_GID=100
```

The folders must be writable by that uid and gid. Keep the default with the named volumes: they belong to 1000:1000, and with another uid the backend stops until you run the `chown` command it prints. A compose file of your own sets the same with `user: "<uid>:<gid>"` on `carta-cocktail-backend`.

**Data on a network share (SMB/NFS).** `chown` is often refused or has no effect there, so the command printed by the backend cannot help. Instead, run the backend as the owner the share gives to its files:

- **SMB/CIFS**: the owner of every file is set by the `uid=` and `gid=` mount options. Mount the share with `uid=1000,gid=1000`, or set `CARTA_UID` and `CARTA_GID` to the values of those options (`mount | grep cifs` shows them). If they show `uid=0`, remount with `uid=1000,gid=1000` (or the uid and gid you chose) rather than setting `CARTA_UID=0`: never run the backend as root. The `file_mode` and `dir_mode` options must give that owner write access.
- **NFS**: with `root_squash` (the default), `chown` run as root in a container is refused (`Operation not permitted`). Change the owner of the folders on the NAS itself, or set `CARTA_UID` and `CARTA_GID` to the uid and gid that own the exported folders (`ls -n` on the client, with NFSv3, or NFSv4 with matching idmap domains; `4294967294` or `65534` means nobody: fix the idmapping first). With `all_squash`, the NAS maps every uid to the `anonuid` and `anongid` of the export: they must own the folders on the NAS.
- **NAS ACLs** (Synology, QNAP…) can refuse writes even to the owner: give that uid read and write access in the NAS settings.

The backend tests its write access at startup and names the folder it cannot write to. A database on a network share also needs `SQLITE_WAL=false` (next section).

#### Database files and network shares

By default, the backend runs SQLite in WAL mode. While it runs, the `db-data` volume holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to `carta_cocktail.db`, and the latest changes may only be in the `-wal` file. Never copy `carta_cocktail.db` alone while the backend runs: use the export in Settings > Backup & Restore, which saves a consistent copy of the database with the photos, or stop the backend and copy the `.db` file together with its `-wal` and `-shm` files when they exist. To put a copy back, use the restore in Settings > Backup & Restore, or follow [Restoring a pre-migration backup](#restoring-a-pre-migration-backup), which removes the old `-wal` and `-shm` files: a restored `.db` next to a stale `-wal` file can be corrupted. A copy put back by hand also brings back its sessions, including those revoked since it was made: set a new `JWT_SECRET` afterwards, as in [UPGRADING › "Signing in after a restore"](UPGRADING.md#signing-in-after-a-restore).

WAL does not work on a network share (SMB or NFS, such as a NAS folder bind-mounted as `/app/data`). In that case, keep the rollback journal: add this line to the `.env` file next to the compose file, then recreate the backend (`docker compose -f docker-compose.prod.yml up -d`):

```bash
SQLITE_WAL=false
```

The line stays in `.env` when you download a new compose file. A compose file of v1.15.0 or older does not pass `SQLITE_WAL` from `.env`: download the current one, or add `- SQLITE_WAL=false` to the `environment` list of `carta-cocktail-backend`, after `- UPLOAD_DIR=/app/uploads` (see [Environment Variables](#environment-variables)). The default `db-data` named volume is local and needs nothing. The startup log shows the mode in use: `SQLite journal mode: wal`, or `delete` with `SQLITE_WAL=false`. When SQLite cannot switch, it keeps the previous mode and the log shows a warning: `SQLite journal mode is <mode>, not <mode> as requested (SQLITE_WAL)`.

#### Recovering the admin account

If you lose the admin password:

1. Set `ADMIN_RESET_PASSWORD=true` (exactly `true`: other values are ignored, with a warning in the log) and the new `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. `ADMIN_EMAIL` defaults to `admin@carta.local`, so set it if your login email is different.
2. Restart the backend: `docker compose -f docker-compose.prod.yml up -d`. The log shows `Admin credentials reset from environment (login email: …)`.
3. Remove `ADMIN_RESET_PASSWORD` from `.env` (or set it back to `false`) and restart again, otherwise every restart resets the password.

## Database migrations

The database schema is versioned with [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate). Migrations live in `backend/prisma/migrations/` and are committed with the schema change that needs them.

### Changing the schema (development)

```bash
cd backend
# Edit prisma/schema.prisma, then create and apply the migration:
npm run db:migrate -- --name add_bottle_barcode
npm run db:check      # exit 0: the migrations match schema.prisma
```

- Review the generated `migration.sql` before committing it: a column rename, for example, is generated as a drop and an add, which loses data.
- SQLite does not run a migration in a transaction: when a statement fails, the ones before it stay applied. Move the statements that can fail on existing data (unique indexes, `CHECK` constraints) to the top of `migration.sql`, before any table is rebuilt, and write them so that they can run twice (`CREATE UNIQUE INDEX IF NOT EXISTS`). A failure then leaves the data as it was, and the migration can run again after `prisma migrate resolve --rolled-back` (see [Recovering from a failed migration](#recovering-from-a-failed-migration)). `20261010173910_schema_integrity` is an example.
- Never use `prisma db push` outside the test suite. The CI runs `npm run db:check` and fails when `schema.prisma` changes without a migration.
- Other scripts: `npm run db:deploy` applies pending migrations without creating any, `npm run db:status` shows which ones are applied.
- A development database created with `db push` (before migrations existed) must be marked as baselined once: `npx prisma migrate resolve --applied 0_init`.

### What the container does at startup

`backend/docker-entrypoint.sh` runs before the API:

1. The container runs as the `node` user (uid 1000), or as `CARTA_UID`:`CARTA_GID` when they are set. The entrypoint first checks that it can write to the database folder and the upload folder. Otherwise it stops and prints the `chown` command to run (see [Data folders and the node user](#data-folders-and-the-node-user)). A command given to the container (`docker compose run carta-cocktail-backend <command>`) runs instead of the steps below.
2. If the database exists and a migration of the image is not applied yet (no migration history, a new migration, or one marked rolled back with `prisma migrate resolve --rolled-back`), it copies the database to `backups/pre-migrate-<date>.db`, next to the database (`/app/data/backups/` in the `db-data` volume). It keeps the 10 most recent copies, and skips the copy when the database has not changed since the last one. It makes no copy while a migration is marked failed: the newest copy stays the one made before the failed attempt.
3. It applies the pending migrations with `prisma migrate deploy`. A new database is created from scratch. If a migration fails, **it refuses to start** and names the migration and the copy to restore: see [Recovering from a failed migration](#recovering-from-a-failed-migration).
4. A database created by `db push` (v1.5.0 and older) has no migration history. If its schema is exactly the one of the first migration, `0_init`, the entrypoint marks `0_init` as applied and continues. Otherwise **it refuses to start**: it prints the differences, leaves the database untouched, and the container exits.
5. It runs the seed, then starts Node. Before listening, the backend records its version. After an upgrade, it logs the required actions of the versions in between, read from the release notes in the image, and the admin shows them in a banner until they are confirmed. A `dev` build records nothing.

### Checking a production database before the first upgrade

Do this once before deploying the first version with migrations, on a copy of the production database:

1. Stop the backend: `docker compose -f docker-compose.prod.yml stop carta-cocktail-backend`.
2. Copy the database out of the volume, and keep this copy until the upgrade is validated. The volume is named `<project>_db-data`, where `<project>` is the folder of the compose file (`docker volume ls | grep db-data` shows it):

   ```bash
   mkdir -p carta-db-copy
   docker run --rm -v <project>_db-data:/data -v "$PWD/carta-db-copy":/out alpine sh -c 'cp /data/carta_cocktail.db* /out/'
   ```

3. From `backend/` in a checkout of the new version (after `npm ci`), compare the copy with `0_init`:

   ```bash
   mkdir baseline
   cp -R prisma/migrations/0_init prisma/migrations/migration_lock.toml baseline/
   DATABASE_URL="file:/absolute/path/to/carta-db-copy/carta_cocktail.db" \
     npx prisma migrate diff --from-config-datasource --to-migrations baseline --script
   rm -r baseline
   ```

   Expected: `-- This is an empty migration.` Otherwise the output is the SQL that would bring the database to `0_init`: read it and fix the database before deploying (see below).
4. Deploy the new image. The entrypoint backs up the database, marks `0_init` as applied, then applies the newer migrations.
5. Check: `docker compose -f docker-compose.prod.yml exec carta-cocktail-backend npx prisma migrate status` prints `Database schema is up to date!`. Open the admin and the public menu.

If the database differs from `0_init`, it usually comes from an older version: start v1.5.0 (the last version that synchronizes the schema with `db push`) once on the database, stop it, then compare again. If differences remain, fix them by hand on the copy, check again, and put the fixed copy back into the volume.

### Running a previous version

The current `docker-compose.prod.yml` does not fit images of v1.11.x or older, so going back to one takes more than changing the image tags:

- **Compose file.** Those images have no `/api/health`: with the current file, their backend stays `unhealthy` and the frontend never starts. Use the compose file of that version, `https://raw.githubusercontent.com/Lulu300/carta-cocktail/v<version>/docker-compose.prod.yml`, with your own changes (keep a copy of the current one). Or remove the backend `healthcheck` block and `user` line (those images start as root), and the frontend `depends_on` condition, from the current file. Up to v1.7.0, the frontend also listens on port 80, not 8080: its port mapping is `"<port>:80"`.
- **Data folder owner.** Those images run as root, and may leave files that the `node` user cannot write. Before upgrading again, give the folders back to uid 1000 (or to `CARTA_UID`:`CARTA_GID`) as in [Data folders and the node user](#data-folders-and-the-node-user): the backend otherwise stops with the `chown` command to run.

To upgrade again, go back to the current compose file with the new image tags.

### Restoring a pre-migration backup

To roll back an upgrade, go back to the previous version (see [Running a previous version](#running-a-previous-version)), then restore the copy made before the migration.

1. Stop the backend and list the copies (the newest is last):

   ```bash
   docker compose -f docker-compose.prod.yml stop carta-cocktail-backend
   docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint ls carta-cocktail-backend -l /app/data/backups/
   ```

2. Restore the chosen copy, replacing `<date>` with its date, then start:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint sh carta-cocktail-backend -c '
     B=/app/data/backups/pre-migrate-<date>.db
     cp "$B" /app/data/carta_cocktail.db
     rm -f /app/data/carta_cocktail.db-wal /app/data/carta_cocktail.db-shm
     if [ -f "$B-wal" ]; then cp "$B-wal" /app/data/carta_cocktail.db-wal; fi'
   docker compose -f docker-compose.prod.yml up -d
   ```

The restored copy brings back its sessions, including those revoked since it was made: set a new `JWT_SECRET` afterwards, as in [UPGRADING › "Signing in after a restore"](UPGRADING.md#signing-in-after-a-restore).

### Recovering from a failed migration

SQLite does not run a migration in a transaction: when a statement fails, the statements before it stay applied, and Prisma marks the migration as failed in the `_prisma_migrations` table. The backend then stops at every start, on `P3018` the first time and `P3009` after. The site is unavailable: the frontend waits for a healthy backend. Read the backend log with `docker compose -f docker-compose.prod.yml logs carta-cocktail-backend`. It ends with this message, under the Prisma error:

```
ERROR: migration 20261010173910_schema_integrity failed. The backend will not start.
SQLite does not run a migration in a transaction: the statements before the one that failed stay applied.
Prisma applies no migration until this one is resolved: previous images (v1.6.0 and later) stop on P3009 too.
Newest copy made before a migration: /app/data/backups/pre-migrate-20261012-101500.db (with its -wal file when there is one).
Nothing was restored. Follow "Recovering from a failed migration" in README.md (section "Database migrations").
```

The Prisma error just above gives the cause, for example `UNIQUE constraint failed: Category.name` (two categories with the same name). Going back to the previous image does not help: images from v1.6.0 apply migrations too, and Prisma refuses to apply anything while a migration is marked failed (up to v1.5.0, images synchronize the schema with `db push` instead). The entrypoint never restores anything by itself, and makes no new copy while a migration is marked failed: the copy named in the message is the one made before the failed attempt.

**Restore the copy.** This works whatever statement failed.

1. Stop the backend, otherwise the restart policy keeps trying: `docker compose -f docker-compose.prod.yml stop carta-cocktail-backend`.
2. Put back the copy named in the message, with its `-wal` file: run the `run … sh -c` command of step 2 of [Restoring a pre-migration backup](#restoring-a-pre-migration-backup), not its `up -d` yet.
3. Start the version you upgraded from, with its own compose file (see [Running a previous version](#running-a-previous-version)): `docker compose -f docker-compose.prod.yml up -d`. Fix the cause in its admin. For duplicates, keep one item, move its bottles and recipe lines to it, then delete the others.
4. When the cause is a duplicate, check the fixed database with the integrity check of the new image. Stop the backend, copy the database out of its volume into `carta-db-copy` (step 2 of [Checking a production database before the first upgrade](#checking-a-production-database-before-the-first-upgrade)), then run, with your new version:

   ```bash
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/carta-db-copy:/data" -e DATABASE_URL=file:/data/carta_cocktail.db \
     --entrypoint node ghcr.io/lulu300/carta-cocktail/backend:<new version> dist/scripts/check-integrity.js
   ```

   Exit code `0`: nothing blocks the migration. Exit code `1`: the output lists what is left to fix. Repeat steps 3 and 4 until it exits `0`.
5. Stop the backend, go back to the current compose file with the new image tags, give the data folders back to uid 1000 (or to `CARTA_UID`:`CARTA_GID`) if the previous version ran as root (see [Running a previous version](#running-a-previous-version)), and start. The entrypoint copies the fixed database to a new `pre-migrate-<date>.db`, then runs the migration again.

**Without restoring.** Only when the migration failed before changing anything: the statement in the error is one of those at the top of its `migration.sql`, before any table is rebuilt (for `20261010173910_schema_integrity`, the unique indexes: `UNIQUE constraint failed: Category.name` or `Unit.abbreviation`). If in doubt, restore the copy.

1. Stop the backend while the compose file still names the new version.
2. Mark the migration as rolled back, with the new image:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm --no-deps carta-cocktail-backend \
     npx prisma migrate resolve --rolled-back <migration>
   ```

3. Fix the cause with the previous version and its own compose file, as in steps 3 and 4 above.
4. Go back to the new version as in step 5 above. The entrypoint copies the database, fixes included, to a new `pre-migrate-<date>.db` before running the migration again: if it fails again, that copy is the one to restore.

A restored copy brings back its sessions: afterwards, set a new `JWT_SECRET`, as in [UPGRADING › "Signing in after a restore"](UPGRADING.md#signing-in-after-a-restore).

## Project Structure

```
carta-cocktail/
├── backend/                # Express API
│   ├── src/
│   │   ├── routes/         # REST endpoints, one file per resource
│   │   ├── services/       # Business logic (availability, backups, menus, cocktails…)
│   │   ├── validation/     # zod schemas of every request
│   │   ├── middleware/     # JWT auth, rate limits, error handler
│   │   ├── bootstrap/      # Startup: admin account, password rule, migration state
│   │   ├── i18n/           # Backend translations
│   │   ├── scripts/        # Seed (default data), integrity check, migration state
│   │   └── utils/          # Helpers
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       └── migrations/     # Versioned migrations
├── frontend/               # React SPA
│   ├── src/
│   │   ├── pages/          # Admin, login and public pages
│   │   ├── components/     # Layouts, UI, admin forms, import wizards
│   │   ├── queries/        # TanStack Query hooks
│   │   ├── contexts/       # Auth, site settings, confirmation dialog
│   │   ├── services/       # API client, ZIP export
│   │   ├── hooks/          # Shared hooks
│   │   ├── i18n/           # EN/FR translations
│   │   └── types/          # TypeScript interfaces
│   └── nginx.conf.template # Production nginx: serves the SPA, proxies /api and /uploads
├── e2e/                    # Playwright journeys against the compose stack
├── .github/workflows/      # CI, Smoke, E2E and Release pipelines
├── docs/operations.md      # Operations guide (French)
├── docs/releases/          # Release notes, one file per version
├── scripts/                # Smoke test and upgrade test bench
├── docker-compose.yml          # Local build
├── docker-compose.prod.yml     # Production (ghcr.io images)
├── UPGRADING.md                # Required actions, version by version
└── .env.example
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite database file, `file:<path>`; a relative path starts from `backend/prisma/`. The compose files set `file:/app/data/carta_cocktail.db` | **required** (`.env.example`: `file:./carta_cocktail.db`) |
| `JWT_SECRET` | Secret for JWT signing, at least 32 characters (`openssl rand -hex 32`) | **required**, no default |
| `ADMIN_EMAIL` | Admin login email, used when the admin is created or reset | `admin@carta.local` |
| `ADMIN_PASSWORD` | Admin password, at least 12 characters, used when the admin is created or reset | **required** on first start, no default |
| `ADMIN_RESET_PASSWORD` | Exactly `true` resets the existing admin's email and password from the two variables above at startup; other values are ignored with a warning | `false` |
| `CARTA_UID`, `CARTA_GID` | Docker only, read by the compose files from `.env`: uid and gid the backend runs as. Set them when the data folders must belong to another owner, such as a network share (see [Data folders and the node user](#data-folders-and-the-node-user)) | `1000` |
| `SQLITE_WAL` | `false` keeps the rollback journal instead of WAL; required when the database is on a network share (SMB/NFS). Other values use WAL. See [Database files and network shares](#database-files-and-network-shares) | `true` |
| `JWT_EXPIRES_IN` | Lifetime of the admin session token: a number of seconds (`86400`) or a timespan (`24h`, `7d`). Applies to tokens issued after the restart. The backend refuses to start with a value it cannot read | `7d` |
| `LOGIN_RATE_LIMIT` | Failed logins allowed per client IP address (per /64 network for IPv6) in 15 minutes; beyond that, the login answers 429 (Too Many Requests). Successful logins do not count. A positive integer, otherwise the backend refuses to start | `10` |
| `API_RATE_LIMIT` | API requests allowed per client IP address (per /64 network for IPv6) in one minute, public menu included; beyond that, the API answers 429 (Too Many Requests). Clients that share an address, such as guests behind a bar's Internet connection, share this count: raise it if they get "Too many requests". The Docker healthcheck does not count. Backup export and import have a fixed limit of their own: 10 requests per 15 minutes from the signed-in admin. A positive integer, otherwise the backend refuses to start | `600` |
| `TRUST_PROXY` | Proxies whose `X-Forwarded-For` header the API believes, to find the client IP address that the rate limits count (`API_RATE_LIMIT`, `LOGIN_RATE_LIMIT` and the backup limit): a number of proxies in front of the API, or a comma-separated list of addresses, subnets or names that Express understands (`loopback`, `linklocal`, `uniquelocal`). The backend refuses to start with a value it cannot read. See [Login limit behind a reverse proxy](#login-limit-behind-a-reverse-proxy) | `loopback, linklocal, uniquelocal` |
| `CORS_ORIGIN` | Origin allowed to call the API from another site, such as `https://example.com` (a single origin, without a trailing slash). Empty: no other origin is allowed. The app does not need one: nginx, and the Vite proxy in development, serve the frontend and the API on the same origin | empty |
| `PUBLIC_BASE_URL` | Public address of the site, such as `https://carte.example.com`, used for the absolute URLs of the link previews that messaging apps show for a shared menu or cocktail. Set it behind an HTTPS reverse proxy: otherwise the address comes from the request, and nginx only sees `http` there. The compose files of v1.17.0 and older do not pass it from `.env`: add `- PUBLIC_BASE_URL=https://…` to the `environment` list of `carta-cocktail-backend`. The backend refuses to start with a value that is not an `http` or `https` address | empty |
| `PORT` | Backend port | `3001` |
| `UPLOAD_DIR` | Folder of the cocktail photos | `<repo>/uploads` outside Docker; `/app/uploads` in the image and the compose files (`uploads` volume) |
| `RELEASES_DIR` | Folder of the release notes read by the upgrade guide of the admin | `<repo>/docs/releases` outside Docker; `/app/releases` in the image |
| `BACKEND_HOST` | Backend hostname for nginx proxy (frontend container) | `carta-cocktail-backend` |

In Docker, set these variables in the `.env` file next to the compose file, then recreate the backend (`docker compose -f docker-compose.prod.yml up -d`). They stay there when you download a new compose file. A variable that is not set, or empty, keeps its default; the defaults suit a standard install. The compose files set `DATABASE_URL`, `PORT`, `UPLOAD_DIR` and `BACKEND_HOST` themselves: a value in `.env` does not change them.

- **Compose file of v1.15.0 or older.** It does not pass `SQLITE_WAL`, `JWT_EXPIRES_IN`, `LOGIN_RATE_LIMIT`, `API_RATE_LIMIT`, `TRUST_PROXY` or `CORS_ORIGIN` from `.env`. Download the current one, or add these variables to the `environment` list of `carta-cocktail-backend`, after `- UPLOAD_DIR=/app/uploads` and without quotes (compose keeps quotes as part of the value in this list), such as `- TRUST_PROXY=1`.
- **Variables in an `env_file`.** A variable of the `environment` list wins over the same variable in an `env_file:` entry, even when it is empty. If your compose file reads these variables from an `env_file`, move them to `.env`, or remove their lines from the `environment` list of the current compose file.

### Login limit behind a reverse proxy

The rate limits count requests per client IP address: every API request (`API_RATE_LIMIT`), backup exports and imports from the signed-in admin (10 per 15 minutes), and failed logins (`LOGIN_RATE_LIMIT`). Clients that share an address share these counters. An IPv6 client counts for its whole /64 network, the network of one LAN: the devices on one Wi-Fi share a counter, as behind one IPv4 address, and a client cannot get around the limits by changing its address within that network. Other networks of the same site (a guest network and a staff network, for example) and mobile phones each have their own counter, so a client that holds several /64 networks (an Internet connection often gets 256) gets one counter for each. The frontend's nginx forwards requests to the API, so the API reads the client address from the `X-Forwarded-For` header, but only from the proxies that `TRUST_PROXY` trusts. The default trusts the host and private networks: nginx, and a reverse proxy in front of it on a private network (SWAG, Traefik…), work without any setting, and an address forged by a client on the Internet is ignored.

The default has limits:

- A client on your local network connects from a private address, so it is trusted: it can forge its address and get around the limits.
- In some installs, the first proxy (nginx, or SWAG) sees clients from the Internet under a **private** address: Docker rootless or Podman (through their port forwarder), Docker Desktop, or IPv6 clients on a published port when the Docker daemon has no IPv6 and `docker-proxy` relays the connection. Every client that arrives this way comes from the same address, and that address is trusted. Clients that do not forge `X-Forwarded-For` all get that address, so they already share each counter: `LOGIN_RATE_LIMIT` failures from any of them block the login of every client that arrives this way, the admin included, for up to 15 minutes, and together they get `API_RATE_LIMIT` requests per minute. A client that writes its own `X-Forwarded-For` gets the address it wrote, so it can change it at each request and get around the limits.

In these installs, set `TRUST_PROXY=1` (nginx alone) or `TRUST_PROXY=2` (SWAG or another reverse proxy in front of nginx) in `.env` (see [Environment Variables](#environment-variables)), then recreate the backend:

```bash
TRUST_PROXY=1
```

The API then uses the address the first proxy sees and ignores what clients write in `X-Forwarded-For`. This removes the bypass and adds no risk of blocking the admin: clients that shared a counter still share it, and the others (IPv4 clients in the `docker-proxy` case) keep their own. Clients that share a counter can still block the admin with their failures; raise `LOGIN_RATE_LIMIT` if that happens too often, and `API_RATE_LIMIT` if guests get "Too many requests". The backup limit counts only the signed-in admin's requests, so other clients cannot use it up. The counters are kept in memory: restarting the backend clears them.

These settings hold only when clients cannot skip a proxy. From v1.12.0, `docker-compose.prod.yml` does not publish the backend port 3001, and `docker-compose.yml` (local build) binds it to `127.0.0.1`. If you published it again, or use a compose file from an older version, a client that connects to it directly passes for the first proxy, and the API reads the address that client wrote in `X-Forwarded-For`: with `TRUST_PROXY=1` or `2`, and also with the default when the connection arrives under a private address, as in the installs listed above (in the `docker-proxy` case, only over IPv6). Behind SWAG, the same goes for nginx's port when a client reaches it without SWAG.

Do not publish these ports. Keep `carta-cocktail-backend` without a `ports` entry, as in `docker-compose.prod.yml`: nginx reaches the backend over the compose network and does not need it. If you call the API from the host, bind the port to the loopback address instead:

```yaml
    ports:
      - "127.0.0.1:3001:3001"
```

Behind SWAG, do the same with nginx's port: no `ports` entry when SWAG reaches nginx over a Docker network, and a loopback binding when SWAG runs on the host, such as `- "127.0.0.1:8080:8080"` (any free host port; nginx listens on 8080 in the container). A host firewall is not enough with rootful Docker: published ports go through Docker's `PREROUTING`, `FORWARD` and `DOCKER-USER` chains, not `INPUT`, so ufw rules and the usual firewalld zone rules do not filter them. Do not forward these ports from the Internet either.

## Git Workflow

This project uses a **feature branch** workflow:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. Make changes
3. Ensure lint, types, and tests pass
4. Open a PR to `develop`
5. Once stable, merge `develop` into `main`
6. Release (see [Release](#release) below): write `docs/releases/vX.Y.Z.md` and the `UPGRADING.md` section on `develop`, tag a pre-release `vX.Y.Z-rc.N` on `develop` to test it, then merge `develop` into `main` and tag the final `vX.Y.Z` on `main`. Always push the branch before the tag.

## CI/CD

**CI** (`.github/workflows/ci.yml`) runs on every PR and push to `main`/`develop`, in five jobs:
- **Backend**: audit of the production dependencies, Prisma migrations in sync with `schema.prisma` (`npm run db:check`), TypeScript, ESLint, build, tests with coverage, delta coverage on PRs (80% of the changed lines)
- **Frontend**: audit of the production dependencies, TypeScript (`tsc -b`), ESLint, build, size budget of the public menu, CSS readable by Safari 16, tests with coverage, delta coverage on PRs
- **Docker build (backend)** and **Docker build (frontend)**: both images are built (`linux/amd64`, not pushed)
- **Docker build (backend arm64 dependencies)**: the backend runtime dependencies (`prod-deps` stage) are built for `linux/arm64` under QEMU, as the release builds them

**Smoke** (`.github/workflows/smoke.yml`) runs on every PR to `main`/`develop`, and in the Release workflow: it starts `docker-compose.yml` and checks login, photo upload, persistence after a backend recreation and backup export, then runs the backend under another uid.

**E2E** (`.github/workflows/e2e.yml`) runs on every PR to `develop`: it starts the same stack and drives the key journeys (sign-in, catalog, menus, public menu, offline, backup) with Playwright in Chromium (`e2e/`). It is not required yet.

These checks are required to merge into `main` and `develop`; a PR to `main` also needs CodeQL results.

### Release

The **Release** workflow (`.github/workflows/release.yml`) runs on version tags (`v*`):

| Tag | Tagged on | Docker images | GitHub Release |
| --- | --- | --- | --- |
| `vX.Y.Z-rc.N` (pre-release) | a commit of `develop` | `:X.Y.Z-rc.N` only, `latest` does not move | marked as pre-release |
| `vX.Y.Z` (final) | a commit of `main` | `:X.Y.Z`, `:X.Y`, `:X` and `latest`, each one only if this version is the highest of its minor, its major, or overall | normal release, marked as latest only if this version is the highest |

Before pushing any image, the workflow runs the whole CI (`ci.yml`) and the compose smoke (`smoke.yml`) on the tagged commit, in parallel. The smoke builds the stack for `linux/amd64` from the tagged code: it stops the publication of a stack that does not start, but does not test the multi-architecture images pushed afterwards. Images are built for `linux/amd64` and `linux/arm64` (the CI builds the `amd64` images and only the backend dependencies stage for `arm64`, so the full `arm64` images are first built here), with SBOM and provenance attestations, and carry their version (`APP_VERSION`, shown in the admin and by `/api/health`; `dev` in any other build).

1. **Notes first.** On `develop`, copy `docs/releases/TEMPLATE.md` to `docs/releases/vX.Y.Z.md` (summary, detailed changes, required actions before and after the upgrade, `breaking`), and add the version's section to `UPGRADING.md`. A pre-release uses the notes of its target version, unless `docs/releases/vX.Y.Z-rc.N.md` exists.
2. **Pre-release.** Push `develop`, then tag it: `git tag vX.Y.Z-rc.N origin/develop && git push origin vX.Y.Z-rc.N`.
3. **Final release.** Merge `develop` into `main` (pull request), then tag `main`: `git fetch origin && git tag vX.Y.Z origin/main && git push origin vX.Y.Z`.

A fix of an older line does not move the tags of a newer one. After `v1.16.0`, tagging `v1.15.1` publishes `:1.15.1` and `:1.15`, but neither `:1` nor `latest`, and its GitHub Release is not marked "Latest". The `verify` job decides this with `.github/scripts/release-tags.mjs`, from the existing final tags, before any image is pushed. Re-running the highest tag keeps all its tags.

**Push the branch before the tag.** The workflow checks that a final tag is reachable from `origin/main` and a pre-release from `origin/develop`. A tag on another commit, or a tag without its notes file, fails before any image is pushed.

- A tag refused by the `verify` job, or whose `ci` or `smoke` job failed, published nothing: delete it (locally and on GitHub), fix the problem, then push it again. When the `ci` or `smoke` job failed on a flaky step, "Re-run failed jobs" in the Release run is enough.
- A tag that published an image is never moved or pushed again. If the release fails after an image push, fix the problem and tag the next pre-release (`-rc.N+1`) for a pre-release, or the next version (for example `v1.5.1`) for a final release.

The GitHub Release contains the notes file (without its front matter), the list of merged pull requests since the previous tag (previous final release for a final tag, previous tag of any kind for a pre-release) and the `docker pull` commands.

### Pulling release images

Prefer `:<major>.<minor>`, which follows the patch releases (see [Docker (production with pre-built images)](#docker-production-with-pre-built-images)):

```bash
docker pull ghcr.io/lulu300/carta-cocktail/backend:1.20
docker pull ghcr.io/lulu300/carta-cocktail/frontend:1.20
```

## API Overview

The API is documented in the admin, on the **API** page: every route, what it accepts and what it answers, with a button that sends a request with the current session (a real one: it changes the data). The page reads an OpenAPI 3.1 document, generated by the backend from the zod schemas of its routes:

- `GET /api/openapi.json`, without signing in: the routes a client can call without a session (public menus, sign-in, health check);
- `GET /api/openapi/full.json`, with the session token: every route.

Calling the API with `curl`, with an API token or a session token: [`docs/operations.md`](docs/operations.md#appeler-lapi) (French).

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/openapi.json` | No | OpenAPI document of the public routes |
| `GET /api/openapi/full.json` | Yes | OpenAPI document of every route |
| `GET /api/health` | No | Status and version (Docker healthcheck) |
| `POST /api/auth/login` | No | Admin login |
| `GET /api/auth/me` | Yes | Signed-in admin |
| `POST /api/auth/logout-all` | Session | Revoke every session and every API token |
| `GET /api/public/*` | No | Public menus and cocktails |
| `GET/POST/PUT/DELETE /api/category-types` | Yes | Category types |
| `GET/POST/PUT/DELETE /api/categories` | Yes | Category management |
| `GET/POST/PUT/DELETE /api/bottles` | Yes | Bottle inventory |
| `POST /api/bottles/import/*` | Yes | Bottle import preview and confirm (JSON, CSV) |
| `GET /api/bottles/export` | Yes | Bottle export (JSON, CSV) |
| `GET/POST/PUT/DELETE /api/ingredients` | Yes | Free ingredients |
| `GET/POST/PUT/DELETE /api/units` | Yes | Measurement units |
| `GET/POST/PUT/DELETE /api/cocktails` | Yes | Cocktail recipes |
| `POST /api/cocktails/:id/image` | Yes | Cocktail photo upload |
| `POST /api/cocktails/import/*` | Yes | Import preview and confirm |
| `GET /api/cocktails/:id/export` | Yes | Export cocktail as JSON |
| `POST /api/cocktails/export` | Yes | Export up to 500 cocktails as JSON, in the order of `ids` |
| `GET/POST/PUT/DELETE /api/menus` | Yes | Menu management |
| `/api/menu-bottles/*` | Yes | Bottles of a menu, their order, sync and exclusions of the system menus |
| `/api/menu-sections/*` | Yes | Menu sections and their order |
| `GET /api/shortages` | Yes | Stock shortage analysis |
| `GET /api/availability/*` | Yes | Cocktail availability |
| `GET/PUT /api/settings` | Yes | Site settings; `PUT /api/settings/profile` (email, password) and `PUT /api/settings/code-mode` ([Code Mode](#code-mode-on-the-server)) need the session |
| `GET/POST/DELETE /api/api-tokens` | Session | API tokens of scripts and MCP clients |
| `GET /api/backup/export`, `POST /api/backup/import` | Session | Backup (database and photos as a ZIP) and restore |
| `POST /api/mcp` | Yes | MCP endpoint for AI agents ([MCP server](#mcp-server)); a read-only token gets the tools that read |

"Yes": the admin session or an API token (`Authorization: Bearer carta_…`); a read-only token may only send `GET` and `HEAD`. "Session": the admin session only, an API token gets `403`.

### MCP server

`/api/mcp` serves the [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP, without sessions, for AI agents: typed tools to read the cocktails, what the stock allows, the shortages, the bottles and the menus, and to adjust a bottle, create or update a cocktail, compose and publish a menu, and preview a cocktail import. Each tool calls an API route with the same token, so the same checks and errors apply. No tool deletes anything, restores a backup or signs out everywhere. Tool list and details: [`docs/operations.md`](docs/operations.md#serveur-mcp-agents-ia) (French).

Create an API token for each client in Settings > API tokens. **Prefer a read-only token**: an agent has every right of its token. A read-only token does not see the tools that write.

Claude Code:

```sh
claude mcp add --transport http carta https://bar.example.com/api/mcp \
  --header "Authorization: Bearer carta_…"
```

Claude Desktop, whose custom connectors take no fixed `Authorization` header, through the local [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge (Node.js), in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "carta": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://bar.example.com/api/mcp",
        "--header",
        "Authorization:${CARTA_AUTH}"
      ],
      "env": { "CARTA_AUTH": "Bearer carta_…" }
    }
  }
}
```

A Code Mode client, such as an agent of the Cloudflare Agents SDK, turns the tools into a TypeScript API that the model calls from code run in its own sandbox: the input and output schemas are written in full, without references.

```ts
import { Agent } from 'agents';
import { createCodeTool } from '@cloudflare/codemode/ai';
import { DynamicWorkerExecutor } from '@cloudflare/codemode';

export class BarAgent extends Agent<Env> {
  async onStart() {
    await this.addMcpServer('carta', 'https://bar.example.com/api/mcp', {
      id: 'carta',
      transport: {
        type: 'streamable-http',
        headers: { Authorization: `Bearer ${this.env.CARTA_MCP_TOKEN}` },
      },
    });
  }

  async codeTool() {
    await this.mcp.waitForConnections({ timeout: 10_000 });
    return createCodeTool({
      tools: this.mcp.getAITools({ serverId: 'carta' }),
      executor: new DynamicWorkerExecutor({ loader: this.env.LOADER }),
    });
  }
}
```

It needs `"compatibility_flags": ["nodejs_compat"]` and `"worker_loaders": [{ "binding": "LOADER" }]` in `wrangler.jsonc`, and the token as a secret (`npx wrangler secret put CARTA_MCP_TOKEN`).

With [Code Mode on the server](#code-mode-on-the-server) turned on, the code runs on Carta instead: the agent needs neither `createCodeTool` nor a Worker Loader, and hands the model the tools of the server, `search` and `execute` included (`streamText({ model, tools: this.mcp.getAITools({ serverId: 'carta' }) })`).

#### Code Mode on the server

Off by default. Settings > "MCP server: Code Mode" turns it on, after a confirmation, for the admin's session only: no API token can turn it on. The MCP server then also lists the two tools of [Cloudflare's Code Mode](https://developers.cloudflare.com/agents/model-context-protocol/codemode/), with the same names, whose `code` is an async arrow function:

- `search({ code })`: the code reads the OpenAPI document of the operations this token may call, with `await codemode.spec()` (`$ref` resolved inline), and returns what it looked for. No network.
- `execute({ code })`: the code calls the API with `await codemode.request({ method, path, query, body })`, which answers `{ status, body }`; an error answer rejects with an `Error` carrying the `status` and `body` of the API.

```json
{ "code": "async () => (await codemode.request({ method: 'GET', path: '/api/bottles', query: { type: 'SPIRIT' } })).body.filter((b) => b.remainingPercent < 20)" }
```

**Risks and limits.** The agent's code runs on the server with the rights of its token, in a sandbox: [QuickJS](https://github.com/justjake/quickjs-emscripten) compiled to WebAssembly, a fresh instance per run, without `require`, `process`, `fetch`, file system or timers. `codemode.request()` reaches the admin operations of the OpenAPI document only, never a `DELETE`, a session-only route (tokens, account, sign out everywhere, backups, this setting) or a route that takes a file, even with the admin's session; a read-only token only reads. Each request goes through the API with the same token, rate limit and errors. A run stops after 10 s, 1 s of computation (the server waits meanwhile), 64 MB of memory, a 128 KiB stack or 50 API requests; the code may hold 20,000 characters, and the answer is cut after 24,000 characters (about 6,000 tokens) with `--- TRUNCATED ---`. Turn it on only for agents you trust. Details and examples: [`docs/operations.md`](docs/operations.md#code-mode-côté-serveur-search-et-execute) (French).

## License

[MIT](LICENSE)
