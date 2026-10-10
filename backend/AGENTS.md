# AGENTS.md - Backend

## Overview

Express 5 REST API with Prisma 6 ORM, SQLite database, JWT authentication, and i18n support.

## Development Workflow

Before committing any change:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. **Add or update tests** for any new or modified feature (see Testing section below)
3. Ensure TypeScript compiles: `npx tsc --noEmit`
4. Ensure build passes: `npm run build`
5. Run tests: `npm test`
6. **Verify coverage thresholds are met**: `npm test -- --coverage`
7. Commit, push, open PR to `develop`

CI runs automatically on PRs: prisma generate → tsc → build → test → coverage check.

## Testing Requirements

**Every new feature or bug fix MUST include integration tests.** A PR will not pass CI until:

1. **Tests are written** covering all new/modified routes, services, and utilities
2. **All tests pass**: `npm test`
3. **Global coverage thresholds are met** (60% minimum):
   - Statements >= 60%, Branches >= 60%, Functions >= 60%, Lines >= 60%
4. **Delta coverage on PRs** (80% minimum): at least 80% of new/modified lines must be covered

### Test conventions

- Test files live next to their source: `routes/bottles.test.ts`, `services/availabilityService.test.ts`
- Use the shared helpers from `src/test/helpers.ts` (DB lifecycle, auth, seed factories)
- Each test file follows: `setupTestDatabase()` in `beforeAll`, `cleanDatabase() + seedRequiredData()` in `beforeEach`, `teardownTestDatabase()` in `afterAll`
- Tests run against a real SQLite test DB (`prisma/test.db`), not mocks
- Run with coverage locally: `npm test -- --coverage`

## Structure

```
backend/
├── src/
│   ├── index.ts              # Server entry (port 3001)
│   ├── app.ts                # Express setup, middleware, route mounting
│   ├── config.ts             # Environment config (port, JWT, upload dir)
│   ├── lib/
│   │   └── prisma.ts         # The only PrismaClient + SQLite setup (WAL)
│   ├── middleware/
│   │   └── auth.ts           # JWT Bearer validation, AuthRequest type
│   ├── routes/               # One file per resource (14 route files)
│   │   ├── auth.ts           # POST /login, GET /me
│   │   ├── categoryTypes.ts  # CRUD /api/category-types
│   │   ├── categories.ts     # CRUD /api/categories
│   │   ├── bottles.ts        # CRUD /api/bottles
│   │   ├── ingredients.ts    # CRUD /api/ingredients + bulk availability
│   │   ├── units.ts          # CRUD /api/units
│   │   ├── cocktails.ts      # CRUD + image upload + import/export
│   │   ├── menus.ts          # CRUD /api/menus
│   │   ├── menuBottles.ts    # /api/menu-bottles + sync endpoint
│   │   ├── menuSections.ts   # /api/menu-sections + reorder
│   │   ├── public.ts         # Public read-only endpoints (no auth)
│   │   ├── shortages.ts      # GET /api/shortages
│   │   ├── availability.ts   # GET cocktail availability
│   │   └── settings.ts       # GET/PUT site settings + admin profile
│   ├── services/
│   │   └── availabilityService.ts  # Stock-based availability calculation
│   ├── utils/
│   │   └── translations.ts   # JSON parse helper for translated names
│   └── i18n/
│       ├── index.ts           # i18next setup + HTTP middleware
│       └── locales/
│           ├── en.json        # English translations
│           └── fr.json        # French translations
├── prisma/
│   ├── schema.prisma          # Database schema (14 models)
│   └── seed.ts                # Admin user, category types, units, menus
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Key Patterns

### Route Pattern

Handlers never catch errors to answer them. Express 5 forwards rejected promises to
`errorHandler` (`src/middleware/errorHandler.ts`), which maps them to `{ error, details? }`:

```typescript
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../errors';

const router = Router();

// Never create a PrismaClient: import the shared one from src/lib/prisma.ts
router.get('/:id', async (req, res) => {
  const item = await prisma.model.findUnique({ where: { id: parseInt(String(req.params.id)) } });
  if (!item) throw new NotFoundError();
  res.json(item);
});

export default router;
```

- Throw the classes of `src/errors.ts` (`BadRequestError`, `NotFoundError`, `ConflictError`, `ForbiddenError`…) with an i18n key.
- Let Prisma errors propagate: the middleware maps P2025 to 404, P2002 to 409, P2003 to 409 on DELETE (400 otherwise) and validation errors (NaN ids) to 400.
- Keep a local handler only for callbacks outside the handler's promise (stream `error` events, multer `destination`): Express never sees those errors.

### Auth Pattern

- Middleware in `auth.ts` extends `Request` as `AuthRequest` with `userId?: number`
- Public routes: `/api/auth/*`, `/api/public/*` (no middleware)
- Protected routes: all others (authMiddleware applied in `app.ts`)
- JWT token in `Authorization: Bearer <token>` header, 7-day expiry

### Express v5 Params

`req.params` values are `string | string[]` in Express v5. Always parse as:
```typescript
const id = parseInt(String(req.params.id));
```

### Translations

Entity names support multi-language via JSON strings stored in SQLite:
```typescript
// Stored as: '{"fr": "Rhum", "en": "Rum"}'
// Parsed with: JSON.parse(entity.nameTranslations || '{}')
```

### Image Upload

- Uses multer with 5MB limit
- Accepted: jpg, jpeg, png, webp
- Stored in `/uploads/cocktails/`
- Served statically at `/uploads/*`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Watch mode with tsx (port 3001) |
| `npm run build` | TypeScript compilation to dist/ |
| `npm start` | Run compiled JS from dist/ |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:seed` | Seed admin, types, units, menus |
| `npm run db:migrate` | Create Prisma migration |

## Dependencies

**Runtime**: express 5, bcryptjs, cors, helmet, morgan, jsonwebtoken, multer, i18next, i18next-http-middleware, dotenv
**Dev**: @prisma/client 6, prisma 6, typescript 5.9, tsx, ts-node

## Database

- SQLite file at `prisma/carta_cocktail.db`
- One shared `PrismaClient` (`src/lib/prisma.ts`), also used by the test helpers. Only `prisma/seed.ts` (separate process) and `src/lib/prisma.test.ts` create their own
- WAL journal mode, set at startup; `SQLITE_WAL=false` keeps the rollback journal, required when the database sits on a network share (SMB/NFS)
- Cascading deletes on most relations
- Unique constraints on slugs, name pairs, menu-entity pairs
- Seed creates: 1 admin, 3 category types (SPIRIT/SYRUP/SOFT), 18 units, 2 system menus (aperitifs/digestifs), site settings

## Ingredient Source Types

`CocktailIngredient.sourceType` determines which FK is populated:
- `BOTTLE` → `bottleId` (specific bottle)
- `CATEGORY` → `categoryId` (any bottle from category)
- `INGREDIENT` → `ingredientId` (free ingredient like lime, sugar)

For `CATEGORY` sources, `CocktailPreferredBottle` records can specify preferred bottles.

## Availability Calculation

`availabilityService.ts` computes how many servings a cocktail can make:
- Checks sealed bottle counts per category
- Evaluates remaining percentage of opened bottles
- Identifies missing or low-stock ingredients
- Returns max servings and shortage details
