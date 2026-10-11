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

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Express 5, TypeScript, Prisma 6, SQLite |
| Frontend | React 19, Vite 7, TailwindCSS 4, React Router 7 |
| Auth | JWT (single admin) |
| i18n | i18next |
| Deploy | Docker Compose |
| CI/CD | GitHub Actions, ghcr.io |

## Quick Start

### Prerequisites

- Node.js 24 or newer (`.nvmrc`; `nvm use` picks it up), required by `engines` in both packages
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

### Docker (production with pre-built images)

Use `docker-compose.prod.yml` to deploy with pre-built images from GitHub Container Registry:

```bash
# Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Create a `.env` file alongside the compose file **before the first start**:

```bash
JWT_SECRET=<output of: openssl rand -hex 32>   # required, at least 32 characters
ADMIN_EMAIL=admin@yourbar.com
ADMIN_PASSWORD=<at least 12 characters>        # required on first start
```

> **Warning:** set `JWT_SECRET` and `ADMIN_PASSWORD` before exposing the app to the Internet. `docker compose` refuses to start without `JWT_SECRET`, and the backend refuses a secret shorter than 32 characters or a known default.

`ADMIN_PASSWORD` is only used to create the admin on first start. After that, change the password from Settings > Profile: it survives restarts and image updates. Changing `JWT_SECRET` logs out existing sessions; it does not touch data.

#### Upgrading

Some versions require actions before or after the upgrade (new variables in `.env`, files to copy out of the old container…). **Read [`UPGRADING.md`](UPGRADING.md) before pulling a new version**, and apply the sections of every version newer than yours, in order. Upgrading from v1.4.0 or older to v1.5.0 requires a `JWT_SECRET` and a copy of the existing cocktail photos.

#### Database files and network shares

By default, the backend runs SQLite in WAL mode. While it runs, the `db-data` volume holds `carta_cocktail.db-wal` and `carta_cocktail.db-shm` next to `carta_cocktail.db`, and the latest changes may only be in the `-wal` file. Never copy `carta_cocktail.db` alone while the backend runs: use the export in Settings > Backup & Restore, which saves a consistent copy of the database with the photos, or stop the backend and copy the `.db` file together with its `-wal` and `-shm` files when they exist. To put a copy back, use the restore in Settings > Backup & Restore, or follow [Restoring a pre-migration backup](#restoring-a-pre-migration-backup), which removes the old `-wal` and `-shm` files: a restored `.db` next to a stale `-wal` file can be corrupted.

WAL does not work on a network share (SMB or NFS, such as a NAS folder bind-mounted as `/app/data`). In that case, set `SQLITE_WAL=false` to keep the rollback journal. The compose files do not pass this variable from `.env`: add it to the `environment` list of `carta-cocktail-backend`, after `- UPLOAD_DIR=/app/uploads`:

```yaml
      - SQLITE_WAL=false
```

Add this line again each time you download a new compose file, for example when upgrading: otherwise the database goes back to WAL. The default `db-data` named volume is local and needs nothing. The startup log shows the mode in use: `SQLite journal mode: wal`, or `delete` with `SQLITE_WAL=false`. When SQLite cannot switch, it keeps the previous mode and the log shows a warning: `SQLite journal mode is <mode>, not <mode> as requested (SQLITE_WAL)`.

#### Recovering the admin account

If you lose the admin password:

1. Set `ADMIN_RESET_PASSWORD=true` (exactly `true`: other values are ignored, with a warning in the log) and the new `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. `ADMIN_EMAIL` defaults to `admin@carta.local`, so set it if your login email is different.
2. Restart the backend: `docker compose -f docker-compose.prod.yml up -d`. The log shows `Admin credentials reset from environment (login email: …)`.
3. Remove `ADMIN_RESET_PASSWORD` from `.env` (or set it back to `false`) and restart again, otherwise every restart resets the password.

We recommend pinning a version instead of `latest`, so that an upgrade only happens after you have read `UPGRADING.md`. Edit the image tags in `docker-compose.prod.yml`:

```yaml
image: ghcr.io/lulu300/carta-cocktail/backend:1.5.0
image: ghcr.io/lulu300/carta-cocktail/frontend:1.5.0
```

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
- Never use `prisma db push` outside the test suite. The CI runs `npm run db:check` and fails when `schema.prisma` changes without a migration.
- Other scripts: `npm run db:deploy` applies pending migrations without creating any, `npm run db:status` shows which ones are applied.
- A development database created with `db push` (before migrations existed) must be marked as baselined once: `npx prisma migrate resolve --applied 0_init`.

### What the container does at startup

`backend/docker-entrypoint.sh` runs before the API:

1. If the database exists and `prisma migrate status` reports pending migrations or no migration history, it copies the database to `backups/pre-migrate-<date>.db`, next to the database (`/app/data/backups/` in the `db-data` volume). It keeps the 10 most recent copies, and skips the copy when the database has not changed since the last one.
2. It applies the pending migrations with `prisma migrate deploy`. A new database is created from scratch.
3. A database created by `db push` (v1.5.0 and older) has no migration history. If its schema is exactly the one of the first migration, `0_init`, the entrypoint marks `0_init` as applied and continues. Otherwise **it refuses to start**: it prints the differences, leaves the database untouched, and the container exits.
4. It runs the seed, then starts Node.

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
   npx prisma db execute --url "file:$PWD/baseline.db" --file prisma/migrations/0_init/migration.sql
   npx prisma migrate diff --from-url "file:/absolute/path/to/carta-db-copy/carta_cocktail.db" --to-url "file:$PWD/baseline.db" --script
   rm baseline.db
   ```

   Expected: `-- This is an empty migration.` Otherwise the output is the SQL that would bring the database to `0_init`: read it and fix the database before deploying (see below).
4. Deploy the new image. The entrypoint backs up the database, marks `0_init` as applied, then applies the newer migrations.
5. Check: `docker compose -f docker-compose.prod.yml exec carta-cocktail-backend npx prisma migrate status` prints `Database schema is up to date!`. Open the admin and the public menu.

If the database differs from `0_init`, it usually comes from an older version: start v1.5.0 (the last version that synchronizes the schema with `db push`) once on the database, stop it, then compare again. If differences remain, fix them by hand on the copy, check again, and put the fixed copy back into the volume.

### Restoring a pre-migration backup

To roll back an upgrade, pin the images back to the previous version in `docker-compose.prod.yml`, then restore the copy made before the migration.

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

## Project Structure

```
carta-cocktail/
├── backend/                # Express API
│   ├── src/
│   │   ├── routes/         # REST endpoints (14 route files)
│   │   ├── services/       # Business logic (availability)
│   │   ├── middleware/      # JWT auth
│   │   ├── i18n/           # Backend translations
│   │   └── utils/          # Helpers
│   └── prisma/
│       ├── schema.prisma   # Database schema (15 models)
│       └── seed.ts         # Default data
├── frontend/               # React SPA
│   ├── src/
│   │   ├── pages/          # Admin (12) + Public (3) pages
│   │   ├── components/     # Layouts, UI, import wizard
│   │   ├── contexts/       # Auth, site settings
│   │   ├── services/       # API client, ZIP export
│   │   ├── hooks/          # useLocalizedName
│   │   ├── i18n/           # EN/FR translations
│   │   └── types/          # TypeScript interfaces
│   └── nginx.conf          # Production reverse proxy
├── .github/workflows/      # CI + Release pipelines
├── docs/releases/          # Release notes, one file per version
├── docker-compose.yml          # Local build
├── docker-compose.prod.yml     # Production (ghcr.io images)
├── UPGRADING.md                # Required actions, version by version
└── .env.example
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite database path | `file:./carta_cocktail.db` |
| `JWT_SECRET` | Secret for JWT signing, at least 32 characters (`openssl rand -hex 32`) | **required**, no default |
| `ADMIN_EMAIL` | Admin login email, used when the admin is created or reset | `admin@carta.local` |
| `ADMIN_PASSWORD` | Admin password, at least 12 characters, used when the admin is created or reset | **required** on first start, no default |
| `ADMIN_RESET_PASSWORD` | Exactly `true` resets the existing admin's email and password from the two variables above at startup; other values are ignored with a warning | `false` |
| `SQLITE_WAL` | `false` keeps the rollback journal instead of WAL; required when the database is on a network share (SMB/NFS). Other values use WAL. In Docker, set it in the compose file (see [Database files and network shares](#database-files-and-network-shares)) | `true` |
| `JWT_EXPIRES_IN` | Lifetime of the admin session token: a number of seconds (`86400`) or a timespan (`24h`, `7d`). Applies to tokens issued after the restart. The backend refuses to start with a value it cannot read | `7d` |
| `LOGIN_RATE_LIMIT` | Failed logins allowed per client IP address in 15 minutes; beyond that, the login answers 429 (Too Many Requests). Successful logins do not count. A positive integer, otherwise the backend refuses to start | `10` |
| `TRUST_PROXY` | Proxies whose `X-Forwarded-For` header the API believes, to find the client IP address that `LOGIN_RATE_LIMIT` counts: a number of proxies in front of the API, or a comma-separated list of addresses, subnets or names that Express understands (`loopback`, `linklocal`, `uniquelocal`). The backend refuses to start with a value it cannot read. See [Login limit behind a reverse proxy](#login-limit-behind-a-reverse-proxy) | `loopback, linklocal, uniquelocal` |
| `CORS_ORIGIN` | Origin allowed to call the API from another site, such as `https://example.com` (a single origin, without a trailing slash). Empty: no other origin is allowed. The app does not need one: nginx, and the Vite proxy in development, serve the frontend and the API on the same origin | empty |
| `PORT` | Backend port | `3001` |
| `BACKEND_HOST` | Backend hostname for nginx proxy (frontend container) | `backend` |

The compose files pass only some of these variables to the backend. To set `JWT_EXPIRES_IN`, `LOGIN_RATE_LIMIT`, `TRUST_PROXY` or `CORS_ORIGIN` in Docker, add it to the `environment` list of `carta-cocktail-backend`, as for `SQLITE_WAL` (see [Database files and network shares](#database-files-and-network-shares)), and add it again each time you download a new compose file. The defaults suit a standard install.

### Login limit behind a reverse proxy

The login limit counts failures per client IP address. The frontend's nginx forwards requests to the API, so the API reads the client address from the `X-Forwarded-For` header, but only from the proxies that `TRUST_PROXY` trusts. The default trusts the host and private networks: nginx, and a reverse proxy in front of it on a private network (SWAG, Traefik…), work without any setting, and an address forged by a client on the Internet is ignored.

The default has limits:

- A client on your local network connects from a private address, so it is trusted: it can forge its address and get around the limit.
- In some installs, the first proxy (nginx, or SWAG) sees a client from the Internet under a **private** address: Docker rootless or Podman (through their port forwarder), Docker Desktop, or an IPv6 client on a published port when the Docker daemon has no IPv6 and `docker-proxy` relays the connection. That address is trusted, so the API reads the address the client wrote in `X-Forwarded-For`: the client can change it at each attempt and get around the limit.

In these installs, set `TRUST_PROXY=1` (nginx alone) or `TRUST_PROXY=2` (SWAG or another reverse proxy in front of nginx) in the `environment` list of `carta-cocktail-backend`:

```yaml
      - TRUST_PROXY=1
```

Write values without quotes in this list: compose keeps them as part of the value, and the backend refuses to start with `- TRUST_PROXY="loopback, linklocal, uniquelocal"`.

The API then uses the address the first proxy sees, which is the same for every client: all clients share one counter. The limit holds, but `LOGIN_RATE_LIMIT` failures from anyone also block the admin for up to 15 minutes. The counters are kept in memory: restarting the backend clears them.

These settings hold only when clients cannot skip a proxy. The compose files still publish the backend port 3001: with `TRUST_PROXY=1` or `2`, a client that connects to it directly passes for the first proxy, and the API reads the address that client wrote in `X-Forwarded-For`. Behind SWAG, the same goes for nginx's port when a client reaches it without SWAG. Do not forward these ports from the Internet, or block them at the firewall.

## Git Workflow

This project uses a **feature branch** workflow:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. Make changes
3. Ensure lint, types, and tests pass
4. Open a PR to `develop`
5. Once stable, merge `develop` into `main`
6. Release (see [Release](#release) below): write `docs/releases/vX.Y.Z.md` and the `UPGRADING.md` section on `develop`, tag a pre-release `vX.Y.Z-rc.N` on `develop` to test it, then merge `develop` into `main` and tag the final `vX.Y.Z` on `main`. Always push the branch before the tag.

## CI/CD

**CI** runs on every PR and push to `main`/`develop`:
- TypeScript type checking
- Prisma migrations in sync with `schema.prisma` (backend, `npm run db:check`)
- ESLint (frontend)
- Build verification
- Tests (must pass to merge)
- Coverage report (uploaded as artifact)

### Release

The **Release** workflow (`.github/workflows/release.yml`) runs on version tags (`v*`):

| Tag | Tagged on | Docker images | GitHub Release |
| --- | --- | --- | --- |
| `vX.Y.Z-rc.N` (pre-release) | a commit of `develop` | `:X.Y.Z-rc.N` only, `latest` does not move | marked as pre-release |
| `vX.Y.Z` (final) | a commit of `main` | `:X.Y.Z` and `latest` | normal release, marked as latest |

1. **Notes first.** On `develop`, copy `docs/releases/TEMPLATE.md` to `docs/releases/vX.Y.Z.md` (summary, detailed changes, required actions before and after the upgrade, `breaking`), and add the version's section to `UPGRADING.md`. A pre-release uses the notes of its target version, unless `docs/releases/vX.Y.Z-rc.N.md` exists.
2. **Pre-release.** Push `develop`, then tag it: `git tag vX.Y.Z-rc.N origin/develop && git push origin vX.Y.Z-rc.N`.
3. **Final release.** Merge `develop` into `main` (pull request), then tag `main`: `git fetch origin && git tag vX.Y.Z origin/main && git push origin vX.Y.Z`.

**Push the branch before the tag.** The workflow checks that a final tag is reachable from `origin/main` and a pre-release from `origin/develop`. A tag on another commit, or a tag without its notes file, fails before any image is pushed.

- A tag refused by the `verify` job published nothing: delete it (locally and on GitHub), fix the problem, then push it again.
- A tag that published an image is never moved or pushed again. If the release fails after an image push, fix the problem and tag the next pre-release (`-rc.N+1`) for a pre-release, or the next version (for example `v1.5.1`) for a final release.

The GitHub Release contains the notes file (without its front matter), the list of merged pull requests since the previous tag (previous final release for a final tag, previous tag of any kind for a pre-release) and the `docker pull` commands.

### Pulling release images

```bash
docker pull ghcr.io/lulu300/carta-cocktail/backend:1.5.0
docker pull ghcr.io/lulu300/carta-cocktail/frontend:1.5.0
```

## API Overview

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/auth/login` | No | Admin login |
| `GET /api/public/*` | No | Public menus and cocktails |
| `GET/POST/PUT/DELETE /api/categories` | Yes | Category management |
| `GET/POST/PUT/DELETE /api/bottles` | Yes | Bottle inventory |
| `GET/POST/PUT/DELETE /api/ingredients` | Yes | Free ingredients |
| `GET/POST/PUT/DELETE /api/units` | Yes | Measurement units |
| `GET/POST/PUT/DELETE /api/cocktails` | Yes | Cocktail recipes |
| `POST /api/cocktails/import/*` | Yes | Import preview and confirm |
| `GET /api/cocktails/:id/export` | Yes | Export cocktail as JSON |
| `GET/POST/PUT/DELETE /api/menus` | Yes | Menu management |
| `GET /api/shortages` | Yes | Stock shortage analysis |
| `GET /api/availability/*` | Yes | Cocktail availability |
| `GET/PUT /api/settings` | Yes | Site settings and profile |

## License

[MIT](LICENSE)
