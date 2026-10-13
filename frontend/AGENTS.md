# AGENTS.md - Frontend

## Overview

React 19 SPA with Vite 8, TailwindCSS 4, React Router 7, and react-i18next. Dark theme UI with admin panel and public menu display.

## Development Workflow

Before committing any change:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. **Add or update tests** for any new or modified feature (see Testing section below)
3. Ensure TypeScript compiles: `npx tsc --noEmit`
4. Ensure lint passes: `npm run lint`
5. Ensure build passes: `npm run build`
6. Run tests: `npm test`
7. **Verify coverage thresholds are met**: `npm test -- --coverage`
8. Commit, push, open PR to `develop`

CI runs automatically on PRs: tsc → lint → build → test → coverage check.

## Testing Requirements

**Every new feature or bug fix MUST include tests.** A PR will not pass CI until:

1. **Tests are written** covering all new/modified components, hooks, utils, and services
2. **All tests pass**: `npm test`
3. **Global coverage thresholds are met** (60% minimum):
   - Statements >= 60%, Branches >= 60%, Functions >= 60%, Lines >= 60%
4. **Delta coverage on PRs** (80% minimum): at least 80% of new/modified lines must be covered

### Test conventions

- Test files live next to their source: `utils/colors.test.ts`, `pages/admin/BottlesPage.test.tsx`
- Use the shared test utilities from `src/test/test-utils.tsx` (custom render with BrowserRouter)
- Setup file `src/test/setup.ts` provides jest-dom matchers, i18n mock, and matchMedia mock, starts the MSW server and resets handlers, factory ids and `localStorage` after each test
- Environment: jsdom via Vitest
- API calls go through the real `services/api.ts` to an MSW fake backend (`src/test/msw/handlers.ts`, one default handler per endpoint). Do not `vi.mock('services/api')`: set the answers a test needs with `mockApiResponse`, `mockApiError`, `mockApiPending`, `mockNetworkError`, and check what the page sent with `captureRequest` (`src/test/msw/utils.ts`). A request without a handler fails the test
- Build test data with the typed factories of `src/test/factories.ts` (`buildBottle`, `buildCategory`…), never with `as never` casts
- Run with coverage locally: `npm test -- --coverage`
- Under an AI agent, Vitest picks its `minimal` reporter, which hides the console of passing tests (`act(...)` warnings, `[MSW]` messages): run `npx vitest run --silent=false` to see it
- Accessibility: page tests check axe with `expect(await axe(container)).toHaveNoViolations()` (`src/test/axe.ts`, serious and critical violations only). jsdom computes no colors: contrast is checked with Lighthouse in a browser

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
│       ├── index.ts              # i18next + browser language detector, public messages
│       ├── admin.ts              # Registers the admin messages (loaded by App.tsx with each /login and /admin chunk)
│       └── locales/
│           ├── public/           # en.json, fr.json: keys used by the first load (public pages, shared components)
│           └── admin/            # en.json, fr.json: every other key (login page and admin)
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

### Locale bundles

Messages are split in two bundles so guests do not download the admin texts. A key goes in `locales/public/` when a file of the first load (reached from `main.tsx` through static imports) uses it, otherwise in `locales/admin/`; `src/i18n/bundles.test.ts` checks the split and fails with the keys to move. A new lazy chunk behind `/login` or `/admin` goes through `lazyWithAdminMessages` in `App.tsx`. A new language with its own message files goes in `TRANSLATED_LANGUAGES` (`i18n/index.ts`, from which `SUPPORTED_LANGUAGES` derives), in the message maps of `i18n/index.ts` and `i18n/admin.ts` (typed by `TRANSLATED_LANGUAGES`, so `tsc` fails until both list it), in `LANGUAGE_NAMES` (`utils/localization.ts`, the names `LanguageSelector` lists) and in `flagComponents` (`LanguageSelector`). A regional variant without files (`en-GB`) goes in `SUPPORTED_LANGUAGES`, `LANGUAGE_NAMES` and `flagComponents` only: it has no entry in the message maps and i18next serves it the messages of its base language.

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
| `npm run format:check` | Prettier check (fails until the repository reformat) |
| `npm run preview` | Preview production build |

## Dependencies

**Runtime**: react 19, react-dom 19, react-router-dom 7, i18next 25, react-i18next 16, i18next-browser-languagedetector 8, jszip 3
**Dev**: vite 8, @vitejs/plugin-react 6, tailwindcss 4, @tailwindcss/vite, typescript 5.9, eslint 10, prettier 3

## Styling Conventions

- Dark theme: backgrounds `#0f0f1a`, `#1a1a2e`, `#2a2a3e`
- Accent colors: amber/yellow for primary actions
- Cards: rounded-xl with subtle borders
- All text via i18n keys, never hardcoded strings: `npm run lint` rejects literal JSX text (`i18next/no-literal-string`; symbols, digits and emojis are allowed)
- Responsive layout with sidebar navigation on admin
- Accessibility: `index.css` draws the keyboard focus on every element (`:focus-visible`), never remove it with `outline-none`. Form fields go through `Field`/`Input` or get an `aria-label`; icon-only buttons through `IconButton`. Dropdowns use `useDisclosure` (Escape, click outside, `aria-expanded`), autocompletes `useComboboxKeyboard` with `ComboboxListbox`. Informative text uses `text-fg-muted` or lighter, never `text-gray-500`/`600`; transitions get `motion-reduce:transition-none` and scale effects `motion-safe:`
