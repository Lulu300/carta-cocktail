# AGENTS.md - Backend

## Overview

Express 5 REST API with Prisma 6 ORM, SQLite database, JWT authentication, and i18n support.

## Development Workflow

Before committing any change:

1. Create a branch from `develop` (`feature/xxx` or `fix/xxx`)
2. Ensure TypeScript compiles: `npx tsc --noEmit`
3. Ensure build passes: `npm run build`
4. Run tests: `npm test`
5. Commit, push, open PR to `develop`

CI runs automatically on PRs: prisma generate → tsc → build → test.

## Structure

```
backend/
├── src/
│   ├── index.ts              # Server entry (port 3001)
│   ├── app.ts                # Express setup, middleware, route mounting
│   ├── config.ts             # Environment config (port, JWT, upload dir)
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

All routes follow this structure:

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Each route file instantiates its own PrismaClient
// Routes use async handlers with try/catch
router.get('/', async (req, res) => {
  try {
    const items = await prisma.model.findMany();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

export default router;
```

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
