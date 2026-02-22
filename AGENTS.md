# AGENTS.md - Carta Cocktail

## Project Overview

Carta Cocktail is a cocktail menu management system with an admin panel and public-facing menu display. It manages cocktail recipes, bottle inventory, ingredient stock, and publishable menus.

**Single admin, single-tenant** - one admin user manages everything via JWT auth.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Express + TypeScript | 5.x |
| ORM | Prisma | 6.x |
| Database | SQLite | file-based |
| Frontend | React + Vite | 19.x / 7.x |
| Styling | TailwindCSS | 4.x |
| Routing | React Router | 7.x |
| i18n | i18next | 25.x |
| Containers | Docker Compose | - |

## Git Workflow

**Branching model**: feature branches → `develop` → `main`

For every change:
1. Create a branch from `develop` (`feature/xxx`, `fix/xxx`)
2. Make changes
3. Ensure lint and tests pass: `cd frontend && npm run lint && npm test` / `cd backend && npm test`
4. Ensure TypeScript compiles: `cd frontend && npx tsc --noEmit` / `cd backend && npx tsc --noEmit`
5. Commit and push the branch
6. Open a PR to `develop` — CI runs automatically
7. Once `develop` is stable, merge to `main`
8. Tag `main` for release: `git tag v1.0.0 && git push --tags`

## CI/CD (GitHub Actions)

**CI** (`.github/workflows/ci.yml`) — runs on PRs and pushes to `main`/`develop`:
- **Backend job**: `npm ci` → `prisma generate` → `tsc --noEmit` → `npm run build` → `npm test`
- **Frontend job**: `npm ci` → `tsc --noEmit` → `npm run lint` → `npm run build` → `npm test`
- Both jobs run in parallel on Node 20

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
- **Express v5 params**: `req.params` values are `string | string[]`. Always use `parseInt(String(req.params.id))`.

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
