# AGENTS.md - Frontend

## Overview

React 19 SPA with Vite 7, TailwindCSS 4, React Router 7, and react-i18next. Dark theme UI with admin panel and public menu display.

## Development Workflow

Before committing any change:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. Ensure TypeScript compiles: `npx tsc --noEmit`
3. Ensure lint passes: `npm run lint`
4. Ensure build passes: `npm run build`
5. Run tests: `npm test`
6. Commit, push, open PR to `develop`

CI runs automatically on PRs: tsc → lint → build → test.

## Structure

```
frontend/
├── src/
│   ├── main.tsx                # Entry point (BrowserRouter, AuthProvider, SiteSettingsProvider, i18n)
│   ├── App.tsx                 # Route definitions (public, auth, admin)
│   ├── index.css               # TailwindCSS imports (@import "tailwindcss")
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── DashboardPage.tsx       # Stats + shortage alerts
│   │   │   ├── CategoriesPage.tsx      # Category CRUD + type management
│   │   │   ├── BottlesPage.tsx         # Bottle inventory management
│   │   │   ├── IngredientsPage.tsx     # Free ingredient management
│   │   │   ├── UnitsPage.tsx           # Measurement unit CRUD
│   │   │   ├── CocktailsPage.tsx       # Cocktail list + batch export
│   │   │   ├── CocktailFormPage.tsx    # Create/edit cocktail (ingredients, instructions, image)
│   │   │   ├── MenusPage.tsx           # Menu management
│   │   │   ├── MenuEditPage.tsx        # Add/reorder cocktails in menu
│   │   │   ├── MenuBottleEditPage.tsx  # Add/reorder bottles in menu
│   │   │   ├── ShortagesPage.tsx       # Stock shortage analysis
│   │   │   └── SettingsPage.tsx        # Site config + admin profile
│   │   ├── auth/
│   │   │   └── LoginPage.tsx           # Admin login
│   │   └── public/
│   │       ├── HomePage.tsx            # Menu listing
│   │       ├── MenuPublicPage.tsx      # Public menu display
│   │       └── CocktailPublicPage.tsx  # Cocktail detail + print/export
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AdminLayout.tsx    # Sidebar nav, ProtectedRoute wrapper
│   │   │   └── PublicLayout.tsx   # Public header/footer
│   │   ├── ui/
│   │   │   ├── ExportCocktailButton.tsx  # Export cocktail as JSON
│   │   │   ├── IconPicker.tsx            # Emoji selector for category types
│   │   │   ├── LanguageSelector.tsx      # EN/FR toggle
│   │   │   └── UnitConverter.tsx         # ml conversion display
│   │   └── import/
│   │       ├── ImportCocktailWizard.tsx  # Main import orchestrator
│   │       ├── ImportStepUpload.tsx      # File drop/select (JSON or ZIP)
│   │       ├── ImportStepResolve.tsx     # Dependency resolution UI
│   │       ├── ImportStepConfirm.tsx     # Preview + confirmation
│   │       └── ImportEntityRow.tsx       # Entity row renderer
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Login/logout, token management, auth state
│   │   └── SiteSettingsContext.tsx # Site name + favicon from API
│   ├── hooks/
│   │   └── useLocalizedName.ts    # Get localized name from translation object
│   ├── services/
│   │   ├── api.ts                 # Centralized API client with typed endpoints
│   │   └── exportZip.ts          # Batch export cocktails to ZIP
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces for all entities
│   ├── utils/
│   │   ├── colors.ts             # Color utilities for category types
│   │   ├── localization.ts       # Localization helpers
│   │   └── unitConverter.ts      # Unit conversion logic
│   └── i18n/
│       ├── index.ts              # i18next + browser language detector
│       └── locales/
│           ├── en.json           # English (~270 keys)
│           └── fr.json           # French
├── package.json
├── tsconfig.json
├── vite.config.ts
├── nginx.conf                    # Production: proxy /api to backend
└── Dockerfile
```

## Routing

| Path | Component | Access |
|------|-----------|--------|
| `/` | HomePage | Public |
| `/menu/:slug` | MenuPublicPage | Public |
| `/menu/:slug/cocktail/:id` | CocktailPublicPage | Public |
| `/login` | LoginPage | Public |
| `/admin` | DashboardPage | Protected |
| `/admin/categories` | CategoriesPage | Protected |
| `/admin/bottles` | BottlesPage | Protected |
| `/admin/ingredients` | IngredientsPage | Protected |
| `/admin/units` | UnitsPage | Protected |
| `/admin/cocktails` | CocktailsPage | Protected |
| `/admin/cocktails/new` | CocktailFormPage | Protected |
| `/admin/cocktails/:id` | CocktailFormPage | Protected |
| `/admin/menus` | MenusPage | Protected |
| `/admin/menus/:id` | MenuEditPage | Protected |
| `/admin/menus/:id/bottles` | MenuBottleEditPage | Protected |
| `/admin/shortages` | ShortagesPage | Protected |
| `/admin/settings` | SettingsPage | Protected |

Protected routes use `ProtectedRoute` wrapper in `App.tsx` which checks `AuthContext`.

## Key Patterns

### API Service

`services/api.ts` is the centralized HTTP client. All API calls go through it with typed request/response. Uses `fetch` with the JWT token from `localStorage`.

### Auth Flow

1. `AuthContext` loads token from `localStorage` on mount
2. Calls `GET /api/auth/me` to validate token
3. On login, stores token and user in state + localStorage
4. `ProtectedRoute` in `App.tsx` redirects to `/login` if no user

### Translation Pattern

Entity names are stored as JSON translation objects. The `useLocalizedName` hook resolves the correct language:
```tsx
const getLocalizedName = useLocalizedName();
const name = getLocalizedName(entity.name, entity.nameTranslations);
```

### Page Pattern

Admin pages are self-contained with inline forms and modals. Each page:
1. Fetches data on mount via `api.ts`
2. Manages local state with `useState`
3. Uses `useTranslation()` for all UI text
4. Handles CRUD operations with optimistic or refetch patterns

### TailwindCSS v4

Uses `@import "tailwindcss"` syntax (not `@tailwind` directives). Dark theme with `bg-[#0f0f1a]` as base background. Custom theme values via `@theme { }` block.

### Import/Export

- Single cocktail: JSON export/import with dependency resolution wizard
- Batch: ZIP export of multiple cocktails via `exportZip.ts` using JSZip
- Import wizard: 3 steps (upload, resolve dependencies, confirm)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 5173, proxies /api to :3001) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Dependencies

**Runtime**: react 19, react-dom 19, react-router-dom 7, i18next 25, react-i18next 16, i18next-browser-languagedetector 8, jszip 3
**Dev**: vite 7, @vitejs/plugin-react, tailwindcss 4, @tailwindcss/vite, typescript 5.9, eslint 9

## Styling Conventions

- Dark theme: backgrounds `#0f0f1a`, `#1a1a2e`, `#2a2a3e`
- Accent colors: amber/yellow for primary actions
- Cards: rounded-xl with subtle borders
- All text via i18n keys, never hardcoded strings
- Responsive layout with sidebar navigation on admin
