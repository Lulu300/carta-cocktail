# AGENTS.md - Frontend

## Overview

React 19 SPA with Vite 8, TailwindCSS 4, React Router 7, and react-i18next. Dark theme UI with admin panel and public menu display.

## Development Workflow

Before committing any change:

1. Create a branch from `develop`: `<type>/<task id>-<slug>` for a plan task (`fix/`, `feature/`, `chore/`, `docs/`, see `docs/plan/README.md`), `feature/xxx` or `fix/xxx` otherwise
2. **Add or update tests** for any new or modified feature (see Testing section below)
3. Ensure TypeScript compiles: `npx tsc -b` (`tsc --noEmit` checks nothing: `tsconfig.json` only holds project references)
4. Ensure lint passes: `npm run lint`
5. Ensure build passes: `npm run build`
6. Run tests: `npm test`
7. **Verify coverage thresholds are met**: `npm test -- --coverage`
8. Commit, push, open PR to `develop`

CI runs automatically on PRs (`Frontend` job of `.github/workflows/ci.yml`): `npm audit --omit=dev --audit-level=high` → `tsc -b` → lint → build → bundle budget (140 kB gzip for the first load of the public menu, and no admin code in the service worker precache, `.github/scripts/bundle-budget.mjs`) → CSS media queries readable by Safari 16 → tests with coverage → delta coverage (80%). The `Docker build (frontend)` job builds the nginx image, and the `Smoke` workflow starts it with the backend (see the root `AGENTS.md`).

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
- Setup file `src/test/setup.ts` provides jest-dom matchers and a matchMedia mock, loads the real i18next instance, starts the MSW server and resets handlers, factory ids and `localStorage` after each test
- i18n is the real instance, loaded as the app has it once the admin is open (`i18n/index.ts` and `i18n/admin.ts`, so both bundles), in English at the start of each test: never mock `react-i18next`. Assertions read the English texts the user sees, by role and accessible name where possible (`getByRole('button', { name: 'Add Unit' })`), not translation keys. Props that carry a key for the component to translate (`messages: { created: 'units.created' }`) keep the key. A plural is checked with the form the test's count picks (`'1 bottle'`, `'5 bottles'`). A text shared by two elements is told apart by role, `within` or position. A test of another language switches the real instance (`await i18n.changeLanguage('fr')`, in a `beforeEach`) and reads the French texts; `setup.ts` goes back to English after each test. A key found in no bundle fails the test that displays it (`src/test/missingKeys.ts`); only `missingKeys.test.ts` may invent one. The one local mock left, `LanguageSelectorFallback.test.tsx`, fakes `i18n.language` for values the real instance never yields
- Environment: jsdom via Vitest
- API calls go through the real `services/api.ts` to an MSW fake backend (`src/test/msw/handlers.ts`, one default handler per endpoint). Do not `vi.mock('services/api')`: set the answers a test needs with `mockApiResponse`, `mockApiError`, `mockApiPending`, `mockNetworkError`, `holdApiResponse` (answers when the test releases it), `mockItemInUse` (a DELETE refused with the impact of an item in use, accepted with `?force=true`), and check what the page sent with `captureRequest` (`src/test/msw/utils.ts`), called after the answers of the same endpoint (MSW tries the handler added last first). A request without a handler fails the test. A stateful page (menu editors, import wizards) gets its own `server.use(...)` handlers that store the data and record each request, built with the shared `readJsonObject`, `errorResponse` and `pendingResponse` of `src/test/msw/utils.ts`
- Build test data with the typed factories of `src/test/factories.ts` (`buildBottle`, `buildCategory`…), never with `as never` casts
- Real providers and components rather than mocks: wrap in `AppProviders` (`src/test/appProviders.tsx`: the real `AuthProvider` and `SiteSettingsProvider`) when a page or hook reads the session or the site settings; store a token in `localStorage` for the admin case. Mock a component only when it has its own tests and the page only needs its outcome (the import wizards, `exportZip`)
- A file download goes through `mockDownload()` (`src/test/download.ts`), which records the saved file names. `rejectNextFetch(value)` covers code that guards against a non-Error throw. Both undo their stubs when the test ends
- Run with coverage locally: `npm test -- --coverage`
- `vitest.config.ts` pins the reporter, so the console of passing tests (`act(...)` warnings, `[MSW]` messages) shows the same under an AI agent as in a terminal or in CI (Vitest would otherwise pick its `minimal` reporter under an agent)
- Accessibility: page tests check axe with `expect(await axe(container)).toHaveNoViolations()` (`src/test/axe.ts`, serious and critical violations only). jsdom computes no colors: contrast is checked with Lighthouse in a browser

## Structure

```
frontend/
├── src/
│   ├── main.tsx                # Entry point (QueryClientProvider, BrowserRouter, SiteSettingsProvider, AuthProvider, ConfirmProvider)
│   ├── App.tsx                 # Route definitions (public, auth, admin), lazy admin chunks
│   ├── index.css               # TailwindCSS imports (@import "tailwindcss") and theme
│   ├── vite-env.d.ts           # Vite env types (VITE_APP_VERSION)
│   ├── pages/
│   │   ├── admin/              # One page per admin route (Dashboard, Categories, Bottles, Ingredients, Units,
│   │   │                       # Cocktails, CocktailForm, Menus, MenuEdit, MenuBottleEdit, Shortages, Settings)
│   │   ├── auth/
│   │   │   └── LoginPage.tsx   # Admin login
│   │   └── public/             # HomePage, MenuPublicPage, CocktailPublicPage and their parts
│   │                           # (sections, search bar, skeletons, error state, useMenuFilter, useScrollRestoration)
│   ├── components/
│   │   ├── admin/              # Shared admin parts: DataTable, TranslationFields, DeletionImpactList,
│   │   │   │                   # LoadError, useConfirmDelete, useEntityForm, useForcedDelete
│   │   │   ├── bottles/        # Bottle form modal, rows, history, export menu, filters
│   │   │   ├── categories/     # Category form modal, category types manager
│   │   │   ├── cocktails/      # Cocktail editor (react-hook-form + zod), list items, filters, selection
│   │   │   └── menus/          # Menu editors: composition, sections, excluded bottles, bottles to add, mutations
│   │   ├── import/             # Cocktail import wizard (upload, resolve, confirm) and bottle import wizard
│   │   ├── layout/             # AdminLayout, PublicLayout, RouteErrorBoundary, SkipLink, AppVersion, BackHomeLink
│   │   └── ui/                 # Design system: Button, Field, Input, Select, Modal, ConfirmDialog, Toaster,
│   │                           # Pagination, SearchInput, SortableHeader, DateInput, LanguageSelector, IconButton…
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Login/logout, token management, auth state
│   │   ├── ConfirmContext.tsx      # Confirmation dialog opened from any component
│   │   └── SiteSettingsContext.tsx # Site name + favicon from API
│   ├── hooks/
│   │   ├── useCategoryTypeName.ts # Category type names admin screens can tell apart (admin messages only)
│   │   ├── useClickOutside.ts
│   │   ├── useLocalizedName.ts    # Get localized name from translation object
│   │   ├── usePageTitle.ts        # Tab title: page parts before the site name
│   │   └── useSort.ts
│   ├── pwa/                    # Service worker registration, loaded after the page (see "Progressive web app")
│   ├── queries/                # TanStack Query: query keys (keys.ts), query client, one file per resource
│   ├── services/
│   │   ├── api.ts                 # Centralized API client with typed endpoints
│   │   └── exportZip.ts          # Batch export cocktails to ZIP
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces for all entities
│   ├── utils/                  # Pure helpers: colors, dates, localization, translations, unitConverter,
│   │                           # cocktailSearch, uploads (photo URLs), chunkReload, bottleGrouping…
│   ├── test/                   # Test setup, MSW fake backend (msw/), factories, providers, axe
│   └── i18n/
│       ├── index.ts              # i18next + browser language detector, public messages
│       ├── admin.ts              # Registers the admin messages (loaded by App.tsx with each /login and /admin chunk)
│       └── locales/
│           ├── public/           # en.json, fr.json: keys used by the first load (public pages, shared components)
│           └── admin/            # en.json, fr.json: every other key (login page and admin)
├── index.html                    # Vite entry page
├── public/                       # Copied as is to dist/: app icons of the web manifest, apple-touch-icon
├── pwa-icons/                    # SVG sources of the app icons
├── package.json
├── tsconfig.json                 # Project references only: check types with `tsc -b`
├── tsconfig.app.json             # src/
├── tsconfig.node.json            # vite.config.ts, vitest.config.ts
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── nginx.conf.template           # Production: nginx server, proxies /api and /uploads to the backend (BACKEND_HOST); link preview robots on /menu/ get the backend's Open Graph page
├── security-headers.conf         # Security headers included by nginx.conf.template
└── Dockerfile                    # Vite build, then nginx (non-root, uid 101, port 8080)
```

## Routing

| Path                       | Component          | Access    |
| -------------------------- | ------------------ | --------- |
| `/`                        | HomePage           | Public    |
| `/menu/:slug`              | MenuPublicPage     | Public    |
| `/menu/:slug/cocktail/:id` | CocktailPublicPage | Public    |
| `/login`                   | LoginPage          | Public    |
| `/admin`                   | DashboardPage      | Protected |
| `/admin/categories`        | CategoriesPage     | Protected |
| `/admin/bottles`           | BottlesPage        | Protected |
| `/admin/ingredients`       | IngredientsPage    | Protected |
| `/admin/units`             | UnitsPage          | Protected |
| `/admin/cocktails`         | CocktailsPage      | Protected |
| `/admin/cocktails/new`     | CocktailFormPage   | Protected |
| `/admin/cocktails/:id`     | CocktailFormPage   | Protected |
| `/admin/menus`             | MenusPage          | Protected |
| `/admin/menus/:id`         | MenuEditPage       | Protected |
| `/admin/menus/:id/bottles` | MenuBottleEditPage | Protected |
| `/admin/shortages`         | ShortagesPage      | Protected |
| `/admin/settings`          | SettingsPage       | Protected |

Protected routes use `ProtectedRoute` wrapper in `App.tsx` which checks `AuthContext`.

## Key Patterns

### API Service

`services/api.ts` is the centralized HTTP client. All API calls go through it with typed request/response. Uses `fetch` with the JWT token from `localStorage`.

### Auth Flow

1. `AuthContext` loads token from `localStorage` on mount
2. Calls `GET /api/auth/me` to validate token. Only a 401 ends the session; any other failure (rate limit, server or network error) keeps the token and sets `sessionError`, and `ProtectedRoute` shows a screen with the server message, "Retry" (`retrySession`), "Sign in again" (`logout`, then the redirect to `/login`) and "Back to home"
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

1. Reads server data through the TanStack Query hooks of `src/queries/`, which call `services/api.ts`; query keys come from `queries/keys.ts` only
2. Manages local UI state with `useState`
3. Uses `useTranslation()` for all UI text
4. Writes through mutations that invalidate the queries showing the changed data (`queries/crud.ts`)

### Locale bundles

Messages are split in two bundles so guests do not download the admin texts. A key goes in `locales/public/` when a file of the first load (reached from `main.tsx` through static imports) uses it, otherwise in `locales/admin/`; `src/i18n/bundles.test.ts` checks the split and fails with the keys to move. A new lazy chunk behind `/login` or `/admin` goes through `lazyWithAdminMessages` in `App.tsx`. A new language with its own message files goes in `TRANSLATED_LANGUAGES` (`i18n/index.ts`, from which `SUPPORTED_LANGUAGES` derives), in the message maps of `i18n/index.ts` and `i18n/admin.ts` (typed by `TRANSLATED_LANGUAGES`, so `tsc` fails until both list it), in `LANGUAGE_NAMES` (`utils/localization.ts`, the names `LanguageSelector` lists), in `CONTENT_LANGUAGE_NAMES` (same file, the labels of the entity name fields of `TranslationFields`) and in `flagComponents` (`LanguageSelector`). Language names are endonyms, never translated. A regional variant without files (`en-GB`) goes in `SUPPORTED_LANGUAGES`, `LANGUAGE_NAMES` and `flagComponents` only (plus `buttonLabels` when its code does not fit the selector's button: `UK`): it has no entry in the message maps and i18next serves it the messages of its base language, and entity names use the translation of its base language. The detector keeps a supported regional code (`en-GB`) and reduces the others to their base language (`en-AU` -> `en`). Only a language picked in `LanguageSelector` is stored (`storeLanguageChoice`, `utils/languageChoice.ts`): the detector caches nothing, so a language nobody picked is detected again at each start. Every language, regional variant included, also gets its date format in `DATE_FORMATS` (`utils/dates.ts`); without one it uses the format of its base language, then English.

### Dates

Dates follow the app's language (`i18n.language`), never the browser's: a date field is a `DateInput` (`components/ui/DateInput.tsx`, not `<input type="date">`), which shows and reads the language's format and hands the form an ISO `yyyy-mm-dd` value, and a displayed date goes through `formatDate` (`utils/dates.ts`). Dates are stored at midnight UTC, so `formatDate` reads their UTC day.

### TailwindCSS v4

Uses `@import "tailwindcss"` syntax (not `@tailwind` directives). Dark theme with `bg-[#0f0f1a]` as base background. Custom theme values via `@theme { }` block.

### Supported browsers

Safari and iOS 16.0+, Chrome and Edge 107+, Firefox 104+ (`build.target` in `vite.config.ts`, the targets of v1.11; Vite 8's default would require Safari 16.4). Old tablets serve as menu displays and for the admin. Do not remove the target: Tailwind writes its breakpoints as range media queries (`width>=40rem`), which Safari before 16.4 ignores, and only this target makes the minifier rewrite them as `min-width`. CI checks the built CSS with `.github/scripts/css-media-ranges.mjs`. The target lowers syntax, not APIs: guard a browser API newer than any of these targets (`URL.canParse`, `Object.groupBy`, `Promise.withResolvers`, or `Array.prototype.toSorted`: Chrome 110, Firefox 115…) or avoid it.

### Progressive web app

`vite-plugin-pwa` (`vite.config.ts`) writes `dist/manifest.webmanifest` and a Workbox service worker, `dist/sw.js`, in `autoUpdate` mode: a new deployment's worker takes over at once, in every tab. `src/pwa/registerServiceWorker.ts` then reloads a public page, but never an admin or login page (`ADMIN_PAGES`, `src/pwa/adminPages.ts`), where a form may be in progress: there `UpdateAvailableBanner` (`components/admin/`, rendered by `AdminLayout` and `LoginPage`) offers a Reload button, through the small store of `src/pwa/updateAvailable.ts`. `main.tsx` imports that module after the `load` event, so the first load of the public menu carries none of it, and only in production (`npm run dev` has no service worker).

- **Precache**: the public shell only, listed by the `publicShell` plugin of `vite.config.ts` from the chunk graph (the entry chunk and its static imports, the registration chunk, the Latin fonts, the icons). Chunks reached through `import()` (login, admin, jszip) stay out. `bundle-budget.mjs` fails the CI if the precache holds admin code or misses a chunk of the first load.
- **Runtime caches**: `NetworkFirst` (3 s) on `/api/public/` requests other than page loads (the link preview pages of `/api/public/share/` stay out), `CacheFirst` (200 entries, 30 days) on `/uploads/`, nothing else. A request with an `Authorization` header (the admin) is never cached nor answered from the cache. The first visit loads the menu before the worker exists: `registerServiceWorker.ts` requests those URLs again once the worker controls the page. Its list of cached paths repeats the one of `vite.config.ts`, whose matchers are copied into `sw.js` and cannot import it.
- **Navigation**: offline, any page but `/admin`, `/login` (`ADMIN_PAGES`, also imported by `vite.config.ts`), `/api/` and `/uploads/` gets the precached `index.html`.
- **nginx**: `/sw.js` and `/manifest.webmanifest` are served with `Cache-Control: no-cache`, the manifest as `application/manifest+json` (`nginx.conf.template`); the smoke test checks both. The CSP needs nothing more: `worker-src` and `manifest-src` fall back to `default-src 'self'`.
- **Tests**: Vitest does not load the plugin; `vitest.config.ts` points `virtual:pwa-register` to the stand-in `src/test/pwaRegister.ts`.
- **Icons**: `pwa-icons/icon.svg` and `maskable.svg` (the glass inside the safe zone, 80% of the width), rendered at 512 px with headless Chrome, which cannot render a smaller window: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --window-size=512,512 --screenshot=../public/pwa-512.png icon.svg` from `pwa-icons/` (then `maskable.svg` to `pwa-maskable-512.png`). The 192 px icon and the 180 px `apple-touch-icon.png` are scaled down from `pwa-512.png` (`sips -z 192 192 pwa-512.png --out pwa-192.png` on macOS).
- **Stuck worker**: `docs/operations.md` ("Carte hors ligne et installation") gives the steps to unregister it in each browser. A service worker needs HTTPS (or `localhost`).

### Import/Export

- Single cocktail: JSON export/import with dependency resolution wizard
- Batch: ZIP export of multiple cocktails via `exportZip.ts` using JSZip
- Import wizard: 3 steps (upload, resolve dependencies, confirm)

## Scripts

| Command                 | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Vite dev server (port 5173, proxies /api to :3001) |
| `npm run build`         | TypeScript check + Vite production build           |
| `npm run lint`          | ESLint                                             |
| `npm run format`        | Prettier, rewrites the files                       |
| `npm run format:check`  | Prettier check (must stay green, CI runs it)       |
| `npm run preview`       | Preview production build                           |
| `npm test`              | Tests (Vitest)                                     |
| `npm run test:watch`    | Tests in watch mode                                |
| `npm run test:coverage` | Tests with coverage                                |

## Dependencies

**Runtime**: react 19, react-dom 19, react-router-dom 7, @tanstack/react-query 5, react-hook-form 7, @hookform/resolvers, zod 4, i18next 27, react-i18next 18, i18next-browser-languagedetector 8, jszip 3
**Dev**: vite 8, @vitejs/plugin-react 6, vite-plugin-pwa 2 (Workbox 7), tailwindcss 4, @tailwindcss/vite, typescript 5.9, eslint 10, eslint-plugin-i18next, prettier 3, vitest, jsdom, @testing-library/*, msw, vitest-axe

**Install scripts**: npm 12 skips the install scripts of dependencies that `allowScripts` in `package.json` does not list (npm 11.19 only warns). None is needed here: `fsevents` (optional, macOS) is denied because its binary ships prebuilt in the package. A new dependency whose script is needed must be added to `allowScripts` (`npm install-scripts approve <pkg> --no-allow-scripts-pin`, no version so that a Dependabot bump keeps working), otherwise denied (`npm install-scripts deny <pkg>`), so that `npm ci` prints no `install-scripts` warning.

## Styling Conventions

- Dark theme: backgrounds `#0f0f1a`, `#1a1a2e`, `#2a2a3e`
- Accent colors: amber/yellow for primary actions
- Cards: rounded-xl with subtle borders
- All text via i18n keys, never hardcoded strings: `npm run lint` rejects literal JSX text (`i18next/no-literal-string`; symbols, digits and emojis are allowed)
- Responsive layout with sidebar navigation on admin
- Accessibility: `index.css` draws the keyboard focus on every element (`:focus-visible`), never remove it with `outline-none`. Form fields go through `Field`/`Input` or get an `aria-label`; icon-only buttons through `IconButton`. Dropdowns use `useDisclosure` (Escape, click outside, `aria-expanded`), autocompletes `useComboboxKeyboard` with `ComboboxListbox`. Informative text uses `text-fg-muted` or lighter, never `text-gray-500`/`600`; transitions get `motion-reduce:transition-none` and scale effects `motion-safe:`
