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
git clone https://github.com/<your-org>/carta-cocktail.git
cd carta-cocktail

# Backend
cd backend
cp ../.env.example .env
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

Default admin credentials: `admin@carta.local` / `admin123`

### Docker

```bash
docker-compose up --build
```

- Frontend: `http://localhost` (port 80)
- Backend API: `http://localhost:3001`

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
├── docker-compose.yml
└── .env.example
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite database path | `file:./carta_cocktail.db` |
| `JWT_SECRET` | Secret for JWT signing | `change-me-to-a-random-secret` |
| `ADMIN_EMAIL` | Admin login email | `admin@carta.local` |
| `ADMIN_PASSWORD` | Admin login password | `admin123` |
| `PORT` | Backend port | `3001` |

## Git Workflow

This project uses a **feature branch** workflow:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. Make changes
3. Ensure lint, types, and tests pass
4. Open a PR to `develop`
5. Once stable, merge `develop` into `main`
6. Tag for release: `git tag v1.0.0 && git push --tags`

## CI/CD

**CI** runs on every PR and push to `main`/`develop`:
- TypeScript type checking
- ESLint (frontend)
- Build verification
- Tests

**Release** runs on version tags (`v*`):
- Builds Docker images (backend + frontend)
- Pushes to GitHub Container Registry (`ghcr.io`)
- Creates a GitHub Release with changelog

### Pulling release images

```bash
docker pull ghcr.io/<your-org>/carta-cocktail/backend:1.0.0
docker pull ghcr.io/<your-org>/carta-cocktail/frontend:1.0.0
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
