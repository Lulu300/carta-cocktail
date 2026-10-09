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

- Node.js 20+
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
npx prisma db push
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
| `PORT` | Backend port | `3001` |
| `BACKEND_HOST` | Backend hostname for nginx proxy (frontend container) | `backend` |

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
