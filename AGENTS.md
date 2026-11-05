# AGENTS.md - Carta Cocktail

## Project Overview

Carta Cocktail is a cocktail menu management system with an admin panel and public-facing menu display. It manages cocktail recipes, bottle inventory, ingredient stock, and publishable menus.

**Single admin, single-tenant** - one admin user manages everything via JWT auth.

## Action Plan (start here for improvement work)

A full review (2026-10-08) produced an action plan in `docs/plan/`. Before picking up improvement work:

- Read `docs/plan/README.md`: task format, lifecycle, branch naming, parallel-work rules.
- Run `node docs/plan/build.mjs --ready` to see which tasks are ready and which can run in parallel.
- Each task is a Markdown file in `docs/plan/tasks/` (source of truth); detailed findings are in `docs/review/2026-10-08/`.
- `node docs/plan/build.mjs` regenerates the tracking page `docs/plan/index.html` (not versioned).

### Multi-agent workflow

- One task = one sub-agent = one git worktree (from `origin/develop`) = one PR. Sub-agents may spawn their own sub-agents when useful.
- Every task PR gets an **independent review sub-agent** before merge. It checks the acceptance criteria, correctness, tests, duplication and the coding conventions below. Fixes go back to the task agent, then the PR is reviewed again.
- Merge only after an approved review and green CI. Then re-run `--ready` to pick the next tasks.
- Stop and ask the human when a task needs a human action or decision (`owner: mixed` or `human`, or flagged in "Points d'attention").

### Cleaning up after a task

The machine is shared with other projects and its disk fills up. Before its final report, every agent removes what it created for the task, and only that: other projects and other sessions of this project use the same Docker and the same temporary folder.

- **Name what you create after the project and the task**, so that it can be found again:
  - temporary files and folders: `mktemp "${TMPDIR:-/tmp}/carta.XXXXXX"` (add `-d` for a folder);
  - compose projects: `carta-<task id in lowercase>`, for example `carta-a-02` (compose refuses uppercase);
  - local images: `carta-<task id in lowercase>-<name>`, or `carta-review-<PR number>` for a reviewer.
  The upgrade bench already prefixes its containers, volumes and networks with `carta-ut-<run id>` (`scripts/upgrade-test/README.md`).
- **Temporary files**: delete the files and folders you created, copies of a test fixture included, by their exact paths. Never with a pattern such as `carta.*` or `carta-uploads-*`: another session may be using a file with the same prefix.
- **Docker**: pass `-p <project>` to every `docker compose` command, `down` included. Variables exported in one shell call are gone in the next one, and a `down -v` on the default project would delete the local stack's data. End with `docker compose -p <project> down -v --remove-orphans --rmi local`. Then remove, by name or by id, only the images you built or pulled for the task:
  - images named `carta-*`;
  - `ghcr.io/lulu300/carta-cocktail/*` images, including the `<none>` ones the bench pulls by digest.
  Never remove a base image (`node`, `nginx`, `alpine`…) and never use `-f`. Then check with name filters, because other projects' containers show in the same lists: `docker ps -a --filter name=carta`, `docker volume ls --filter name=carta`, `docker network ls --filter name=carta`, and `docker images | grep -E 'carta|<none>'`.
- **Upgrade bench**: a run removes its own resources, also when interrupted with Ctrl+C. After a `--keep` run or a `kill -9`, remove that run's `carta-ut-<run id>` containers, volumes and networks by name. `run.mjs --clean-all` removes those of every run: only the coordinator uses it, when no bench is running. The helper image `carta-upgrade-test-sqlite:1` stays.
- **Never**:
  - any `docker … prune` or `npm cache clean`;
  - the BuildKit build cache, which is shared and cannot be cleared for this project alone;
  - anything outside this repository's worktrees and your own temporary files;
  - `~/carta-fixtures/`: the fixture itself is never deleted, only your copies of it.
- **Build outputs** (`node_modules`, `dist`, `coverage`) stay inside your worktree, and go away with it.
- **The coordinator, at the end of a batch**:
  - removes the batch's worktrees and branches, and empties its scratchpad;
  - removes the images shared by the batch: `carta-upgrade-test/*:local`, the `ghcr.io/lulu300/carta-cocktail/*` images pulled for the bench, and the reviewers' `carta-review-*`;
  - removes the empty `carta-uploads-*` folders older than a day, which interrupted backend test runs leave in the system temp folder;
  - runs the Docker check above again.
  A worktree, container or image that another running session still uses stays.

## Coding Conventions

- **English everywhere in code**: identifiers, comments, commit messages, PR titles and descriptions. User-facing text goes through i18n (en/fr), never hard-coded. The plan and review documents in `docs/` are written in French.
- **Commits** follow Conventional Commits (`fix:`, `feat:`, `refactor:`, `test:`, `chore(deps):`, `docs:`…). PR titles for plan tasks start with the task id (`A-02: …`).
- **Readable, clear, concise code**: small functions, explicit names, no clever one-liners, no dead code. Comment the *why*, not the *what*.
- **No duplication**: before writing a helper, component, hook or query, search for an existing one and reuse or extend it. Extract shared logic instead of copy-pasting it.
- **Stay in scope**: change only what the task requires. Record any other problem you find as a new task in `docs/plan/tasks/`, not in the same PR.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Express + TypeScript | 5.x |
| ORM | Prisma (better-sqlite3 adapter) | 7.x |
| Database | SQLite | file-based |
| Frontend | React + Vite | 19.x / 8.x |
| Styling | TailwindCSS | 4.x |
| Routing | React Router | 7.x |
| i18n | i18next | 25.x |
| Containers | Docker Compose | - |

## Git Workflow

**Branching model**: feature branches → `develop` → `main`

For every change:
1. Create a branch from `develop` (`feature/xxx`, `fix/xxx`)
2. Make changes
3. **Add or update tests** for any new or modified feature (see Testing section below)
4. Ensure lint and tests pass: `cd frontend && npm run lint && npm test` / `cd backend && npm run lint && npm test`. Formatting follows the root `.editorconfig` and `.prettierrc`; `npm run format:check` exists in both packages but still fails until the one-off repository reformat is done, so do not reformat files outside your change
5. Ensure TypeScript compiles: `cd frontend && npx tsc --noEmit` / `cd backend && npx tsc --noEmit`
6. **Verify coverage thresholds are met** (see Testing section below)
7. Commit (Conventional Commits, in English) and push the branch
8. Open a PR to `develop` — CI runs automatically
9. Once `develop` is stable, merge to `main`
10. Tag `main` for release: `git tag v1.0.0 && git push --tags`

## Testing Requirements

**Every new feature or bug fix MUST include tests.** A PR will not be considered ready for review until:

1. **Tests are written** covering the new/modified behavior (backend integration tests and/or frontend unit/integration tests)
2. **All tests pass**: `cd backend && npm test` and `cd frontend && npm test`
3. **Global coverage thresholds are met** (60% minimum on all metrics):
   - Statements >= 60%
   - Branches >= 60%
   - Functions >= 60%
   - Lines >= 60%
4. **Delta coverage on PRs** (80% minimum): at least 80% of new/modified lines must be covered by tests

Coverage is enforced automatically by CI. Run `npm test -- --coverage` in either package to check locally.

## CI/CD (GitHub Actions)

**CI** (`.github/workflows/ci.yml`) — runs on PRs and pushes to `main`/`develop`:
- **Backend job**: `npm ci` (postinstall: `prisma generate`) → `tsc --noEmit` → `npm run build` → `npm test`
- **Frontend job**: `npm ci` → `tsc --noEmit` → `npm run lint` → `npm run build` → `npm test`
- Both jobs run in parallel on Node 24, the version used by the Docker images (`.nvmrc`); `engines` in both `package.json` require Node >= 24

**Smoke** (`.github/workflows/smoke.yml`) — runs on PRs to `main`/`develop` and on demand:
- Builds and starts `docker-compose.yml`, then runs `scripts/smoke/smoke.sh` through nginx: login, 2.4 MB photo upload, photo still served after the backend container is recreated, backup export
- Locally, always in a dedicated compose project: `export COMPOSE_PROJECT_NAME=carta-smoke JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD=$(openssl rand -hex 16)`, then `docker compose up -d --build --wait && ./scripts/smoke/smoke.sh`, then `docker compose -p carta-smoke down -v --remove-orphans --rmi local`, all in the same shell call (`smoke.sh` reads `COMPOSE_PROJECT_NAME` to recreate the backend). The default project is your local stack: `down -v` would delete its data (see the header of `smoke.sh`)

**Release** (`.github/workflows/release.yml`) — runs on tag push `v*`:
- Builds backend and frontend Docker images
- Pushes to `ghcr.io/<repo>/backend:<version>` and `ghcr.io/<repo>/frontend:<version>` (+ `latest`)
- Creates a GitHub Release with auto-generated changelog

## Directory Structure

```
/
├── backend/           # Express API server (see backend/AGENTS.md)
├── frontend/          # React SPA (see frontend/AGENTS.md)
├── uploads/           # Cocktail images (Docker volume)
├── docker-compose.yml # 2 services: backend (port 3001) + frontend/nginx (port 80)
└── .env.example       # Environment template
```

## Database Schema (14 models)

```
User                    # Single admin (email + password hash)
CategoryType            # Dynamic types: SPIRIT, SYRUP, SOFT, custom
Category                # Bottle categories (type + desired stock)
Bottle                  # Inventory items (capacity, remaining%, apero/digestif flags)
Ingredient              # Non-bottle ingredients (garnishes, fresh items)
Unit                    # Measurement units with ml conversion factors
Cocktail                # Recipe definitions
CocktailIngredient      # Composition (source: BOTTLE | CATEGORY | INGREDIENT)
CocktailPreferredBottle # Preferred bottles for category-sourced ingredients
CocktailInstruction     # Recipe steps
Menu                    # Collections (type: COCKTAILS | APEROS | DIGESTIFS)
MenuCocktail            # Cocktails in menus (position, visibility)
MenuBottle              # Bottles in menus (position, visibility)
MenuSection             # Menu groupings
SiteSettings            # Site name + favicon emoji
```

## Key Architectural Decisions

- **Translations as JSON strings**: Entity names store translations as JSON strings in SQLite (`{"fr": "...", "en": "..."}`). Parsed with `JSON.parse()` at runtime.
- **Three ingredient source types**: `CocktailIngredient.sourceType` is `BOTTLE`, `CATEGORY`, or `INGREDIENT` - polymorphic via nullable FKs.
- **System menus**: "aperitifs" and "digestifs" menus are auto-created and non-deletable. Bottles sync automatically when `isApero`/`isDigestif` flags change.
- **Position-based ordering**: All list items use a `position` integer field for custom ordering.
- **Input validation**: every route validates its `params`, `query` and `body` with zod schemas (`backend/src/validation/`) through the `validate()` middleware, and reads the typed result with `valid(res)` (see `backend/AGENTS.md`, which names the one exception: the public cocktail routes answer 404 for an invalid id).

## Running Locally

```bash
# Backend (terminal 1)
cd backend && npm install && npx prisma db push && npm run db:seed && npm run dev

# Frontend (terminal 2)
cd frontend && npm install && npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173 (proxies /api to backend)
- Admin: admin@carta.local / admin123

## API Structure

- **Public** (no auth): `/api/auth/*`, `/api/public/*`
- **Protected** (JWT Bearer): All other `/api/*` routes
- Auth middleware validates JWT and sets `req.userId`

## Languages

- English (en) - fallback
- French (fr)
- Both backend error messages and frontend UI are translated

## Docker

```bash
docker-compose up --build
```

Backend on port 3001, frontend/nginx on port 80. Volumes: `db-data` (SQLite), `uploads` (images).
