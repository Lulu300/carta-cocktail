import { http, HttpResponse, type DefaultBodyType, type PathParams, type StrictRequest } from 'msw';
import type { CocktailExportFormat } from '../../types';
import {
  buildAvailability,
  buildBottle,
  buildCategory,
  buildCategoryType,
  buildCocktail,
  buildIngredient,
  buildMenu,
  buildMenuBottle,
  buildMenuSection,
  buildSiteSettings,
  buildUnit,
} from '../factories';

/**
 * Default answers of the backend, one handler per endpoint of `services/api.ts`.
 * A test changes an answer with `server.use(...)` or the helpers of `./utils`;
 * `server.resetHandlers()` restores these defaults after each test.
 *
 * Paths are relative: MSW resolves them on the jsdom origin, like `fetch('/api/…')`.
 */

export const ADMIN_USER = { id: 1, email: 'admin@carta.local' };

function exportedRecipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2026-01-15T10:00:00.000Z',
    cocktail: { name, description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  };
}

async function readJsonObject(request: StrictRequest<DefaultBodyType>): Promise<Record<string, unknown>> {
  const body = await request.json();
  return typeof body === 'object' && body !== null ? { ...body } : {};
}

const FIRST_CREATED_ID = 1000;
let createdId = FIRST_CREATED_ID;

/** Restarts the ids given to created objects: run after each test, like `resetFactories`. */
export function resetCreatedIds(): void {
  createdId = FIRST_CREATED_ID;
}

/** POST on a collection: the server answers with what it received plus a new id. */
async function echoCreated({ request }: { request: StrictRequest<DefaultBodyType> }) {
  createdId += 1;
  return HttpResponse.json({ ...(await readJsonObject(request)), id: createdId }, { status: 201 });
}

/** PUT on `/:id`: the server answers with what it received, under that id. */
async function echoUpdated({ request, params }: { request: StrictRequest<DefaultBodyType>; params: PathParams }) {
  return HttpResponse.json({ ...(await readJsonObject(request)), id: Number(params.id) });
}

const deleted = () => HttpResponse.json({ message: 'Deleted' });
const done = () => HttpResponse.json({ message: 'OK' });

const authHandlers = [
  http.post('/api/auth/login', () => HttpResponse.json({ token: 'test-token', user: ADMIN_USER })),
  http.get('/api/auth/me', () => HttpResponse.json(ADMIN_USER)),
];

const categoryTypeHandlers = [
  http.get('/api/category-types', () =>
    HttpResponse.json([buildCategoryType({ name: 'SPIRIT' }), buildCategoryType({ name: 'SYRUP' })]),
  ),
  http.post('/api/category-types', async ({ request }) => HttpResponse.json(await readJsonObject(request), { status: 201 })),
  http.put('/api/category-types/:name', async ({ request, params }) =>
    HttpResponse.json({ ...(await readJsonObject(request)), name: params.name }),
  ),
  http.delete('/api/category-types/:name', deleted),
];

const categoryHandlers = [
  http.get('/api/categories', () => HttpResponse.json([buildCategory({ id: 1 }), buildCategory({ id: 2 })])),
  http.get('/api/categories/:id', ({ params }) => HttpResponse.json(buildCategory({ id: Number(params.id) }))),
  http.post('/api/categories', echoCreated),
  http.put('/api/categories/:id', echoUpdated),
  http.delete('/api/categories/:id', deleted),
];

const bottleHandlers = [
  http.get('/api/bottles', () => HttpResponse.json([buildBottle({ id: 1 }), buildBottle({ id: 2 })])),
  http.get('/api/bottles/export', () =>
    HttpResponse.text('name,category\n', {
      headers: { 'Content-Disposition': 'attachment; filename="bottles.csv"' },
    }),
  ),
  http.get('/api/bottles/:id', ({ params }) => HttpResponse.json(buildBottle({ id: Number(params.id) }))),
  http.post('/api/bottles', echoCreated),
  http.put('/api/bottles/:id', echoUpdated),
  http.delete('/api/bottles/:id', deleted),
];

const ingredientHandlers = [
  http.get('/api/ingredients', () => HttpResponse.json([buildIngredient({ id: 1 }), buildIngredient({ id: 2 })])),
  http.get('/api/ingredients/:id', ({ params }) => HttpResponse.json(buildIngredient({ id: Number(params.id) }))),
  http.post('/api/ingredients/bulk-availability', () => HttpResponse.json({ updated: 0 })),
  http.post('/api/ingredients', echoCreated),
  http.put('/api/ingredients/:id', echoUpdated),
  http.delete('/api/ingredients/:id', deleted),
];

const unitHandlers = [
  http.get('/api/units', () => HttpResponse.json([buildUnit({ id: 1 }), buildUnit({ id: 2 })])),
  http.get('/api/units/:id', ({ params }) => HttpResponse.json(buildUnit({ id: Number(params.id) }))),
  http.post('/api/units', echoCreated),
  http.put('/api/units/:id', echoUpdated),
  http.delete('/api/units/:id', deleted),
];

const cocktailHandlers = [
  http.get('/api/cocktails', () => HttpResponse.json([buildCocktail({ id: 1 }), buildCocktail({ id: 2 })])),
  http.get('/api/cocktails/:id', ({ params }) => HttpResponse.json(buildCocktail({ id: Number(params.id) }))),
  http.get('/api/cocktails/:id/export', ({ params }) =>
    HttpResponse.json(exportedRecipe(buildCocktail({ id: Number(params.id) }).name), {
      headers: { 'Content-Disposition': `attachment; filename="cocktail-${String(params.id)}.json"` },
    }),
  ),
  http.post('/api/cocktails', echoCreated),
  http.put('/api/cocktails/:id', echoUpdated),
  http.delete('/api/cocktails/:id', deleted),
  http.post('/api/cocktails/:id/image', ({ params }) =>
    HttpResponse.json(buildCocktail({ id: Number(params.id), imagePath: `/uploads/cocktail-${String(params.id)}.jpg` })),
  ),
];

const menuHandlers = [
  http.get('/api/menus', () => HttpResponse.json([buildMenu({ id: 1 }), buildMenu({ id: 2 })])),
  http.get('/api/menus/:id', ({ params }) => HttpResponse.json(buildMenu({ id: Number(params.id) }))),
  http.post('/api/menus', echoCreated),
  http.put('/api/menus/:id', echoUpdated),
  http.delete('/api/menus/:id', deleted),
];

const menuBottleHandlers = [
  http.get('/api/menu-bottles/menu/:menuId', ({ params }) =>
    HttpResponse.json([buildMenuBottle({ menuId: Number(params.menuId) })]),
  ),
  http.get('/api/menu-bottles/menu/:menuId/exclusions', () => HttpResponse.json([])),
  http.post('/api/menu-bottles/menu/:menuId/exclusions', done),
  http.delete('/api/menu-bottles/menu/:menuId/exclusions/:bottleId', done),
  http.post('/api/menu-bottles/menu/:menuId/sync', () => HttpResponse.json({ message: 'OK', added: 0, removed: 0 })),
  http.post('/api/menu-bottles/menu/:menuId/reorder', done),
  http.post('/api/menu-bottles', echoCreated),
  http.put('/api/menu-bottles/:id', echoUpdated),
  http.delete('/api/menu-bottles/:id', deleted),
];

const menuSectionHandlers = [
  http.get('/api/menu-sections/menu/:menuId/sections', ({ params }) =>
    HttpResponse.json([buildMenuSection({ menuId: Number(params.menuId) })]),
  ),
  http.post('/api/menu-sections/menu/:menuId/sections/reorder', done),
  http.post('/api/menu-sections/menu/:menuId/sections', echoCreated),
  http.put('/api/menu-sections/sections/:id', echoUpdated),
  http.delete('/api/menu-sections/sections/:id', deleted),
];

const publicHandlers = [
  http.get('/api/public/menus', () => HttpResponse.json([buildMenu({ id: 1 })])),
  http.get('/api/public/menus/:slug', ({ params }) => HttpResponse.json(buildMenu({ id: 1, slug: String(params.slug) }))),
  http.get('/api/public/cocktails/:id', ({ params }) =>
    HttpResponse.json(buildCocktail({ id: Number(params.id), available: true })),
  ),
  http.get('/api/public/cocktails/:id/export', ({ params }) =>
    HttpResponse.json(exportedRecipe(buildCocktail({ id: Number(params.id) }).name), {
      headers: { 'Content-Disposition': `attachment; filename="cocktail-${String(params.id)}.json"` },
    }),
  ),
  http.get('/api/public/settings', () => HttpResponse.json(buildSiteSettings())),
  http.get('/api/public/units', () => HttpResponse.json([buildUnit({ id: 1 }), buildUnit({ id: 2 })])),
];

const stockHandlers = [
  // No shortage by default: a test that needs one says so.
  http.get('/api/shortages', () => HttpResponse.json([])),
  http.get('/api/availability/cocktails', () =>
    HttpResponse.json({ 1: buildAvailability({ cocktailId: 1 }), 2: buildAvailability({ cocktailId: 2 }) }),
  ),
  http.get('/api/availability/cocktails/:id', ({ params }) =>
    HttpResponse.json(buildAvailability({ cocktailId: Number(params.id) })),
  ),
];

const settingsHandlers = [
  http.get('/api/settings', () => HttpResponse.json(buildSiteSettings())),
  http.put('/api/settings', async ({ request }) => HttpResponse.json({ ...(await readJsonObject(request)), id: 1 })),
  http.put('/api/settings/profile', async ({ request }) => {
    const body = await readJsonObject(request);
    return HttpResponse.json({ ...ADMIN_USER, ...(typeof body.email === 'string' ? { email: body.email } : {}) });
  }),
  http.get('/api/backup/export', () =>
    HttpResponse.arrayBuffer(new ArrayBuffer(8), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="backup.zip"' },
    }),
  ),
];

export const handlers = [
  ...authHandlers,
  ...categoryTypeHandlers,
  ...categoryHandlers,
  ...bottleHandlers,
  ...ingredientHandlers,
  ...unitHandlers,
  ...cocktailHandlers,
  ...menuHandlers,
  ...menuBottleHandlers,
  ...menuSectionHandlers,
  ...publicHandlers,
  ...stockHandlers,
  ...settingsHandlers,
];
