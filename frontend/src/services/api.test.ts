import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the request helper behavior by importing the module and mocking fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Dynamic import to get fresh module
async function getApi() {
  const mod = await import('./api');
  return mod;
}

function mockOk(data: unknown = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

describe('API request helper', () => {
  it('should include auth header when token exists', async () => {
    localStorage.setItem('token', 'my-token');
    mockOk([]);
    const api = await getApi();
    await api.categories.list();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-token');
  });

  it('should set Content-Type to application/json', async () => {
    localStorage.setItem('token', 'my-token');
    mockOk([]);
    const api = await getApi();
    await api.categories.list();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('should remove token on 401 response', async () => {
    localStorage.setItem('token', 'expired-token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    const api = await getApi();
    await expect(api.categories.list()).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should throw with error message from response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    });
    const api = await getApi();
    await expect(api.categories.list()).rejects.toThrow('Validation failed');
  });

  it('should throw with HTTP status when no error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    const api = await getApi();
    await expect(api.categories.list()).rejects.toThrow('HTTP 500');
  });

  it('should not include auth header when no token', async () => {
    mockOk([]);
    const api = await getApi();
    await api.publicApi.listMenus();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });
});

describe('auth API', () => {
  it('should call POST /auth/login', async () => {
    mockOk({ token: 'jwt', user: { id: 1, email: 'a@b.c' } });
    const api = await getApi();
    await api.auth.login('a@b.c', 'pass');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.c', password: 'pass' });
  });

  it('should call GET /auth/me', async () => {
    localStorage.setItem('token', 'tok');
    mockOk({ id: 1, email: 'a@b.c' });
    const api = await getApi();
    await api.auth.me();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/me');
  });
});

describe('categories API', () => {
  it('should call CRUD endpoints', async () => {
    const api = await getApi();

    mockOk([]);
    await api.categories.list();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/categories');

    mockOk({});
    await api.categories.get(1);
    expect(mockFetch.mock.calls[1][0]).toBe('/api/categories/1');

    mockOk({});
    await api.categories.create({ name: 'Vodka' });
    expect(mockFetch.mock.calls[2][1].method).toBe('POST');

    mockOk({});
    await api.categories.update(1, { name: 'Gin' });
    expect(mockFetch.mock.calls[3][1].method).toBe('PUT');

    mockOk({ message: 'ok' });
    await api.categories.delete(1);
    expect(mockFetch.mock.calls[4][1].method).toBe('DELETE');
  });
});

describe('bottles API', () => {
  it('should list with no params', async () => {
    mockOk([]);
    const api = await getApi();
    await api.bottles.list();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/bottles');
  });

  it('should list with type filter', async () => {
    mockOk([]);
    const api = await getApi();
    await api.bottles.list({ type: 'SPIRIT' });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/bottles?type=SPIRIT');
  });

  it('should list with categoryId filter', async () => {
    mockOk([]);
    const api = await getApi();
    await api.bottles.list({ categoryId: 5 });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/bottles?categoryId=5');
  });

  it('should call CRUD endpoints', async () => {
    const api = await getApi();
    mockOk({});
    await api.bottles.get(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/bottles/1');

    mockOk({});
    await api.bottles.create({ name: 'Test' });
    expect(mockFetch.mock.calls[1][1].method).toBe('POST');

    mockOk({});
    await api.bottles.update(1, { name: 'Updated' });
    expect(mockFetch.mock.calls[2][1].method).toBe('PUT');

    mockOk({ message: 'ok' });
    await api.bottles.delete(1);
    expect(mockFetch.mock.calls[3][1].method).toBe('DELETE');
  });
});

describe('ingredients API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.ingredients.list();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/ingredients');

    mockOk({});
    await api.ingredients.get(1);
    mockOk({});
    await api.ingredients.create({ name: 'Lime' });
    mockOk({});
    await api.ingredients.update(1, { name: 'Lemon' });
    mockOk({ message: 'ok' });
    await api.ingredients.delete(1);
    mockOk({ updated: 5 });
    await api.ingredients.bulkAvailability({ available: true });
    expect(mockFetch.mock.calls[5][0]).toBe('/api/ingredients/bulk-availability');
    expect(mockFetch.mock.calls[5][1].method).toBe('POST');
  });
});

describe('units API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.units.list();
    mockOk({});
    await api.units.get(1);
    mockOk({});
    await api.units.create({ name: 'cl', abbreviation: 'cl' });
    mockOk({});
    await api.units.update(1, { name: 'ml' });
    mockOk({ message: 'ok' });
    await api.units.delete(1);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

describe('cocktails API', () => {
  it('should call CRUD and special endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.cocktails.list();
    mockOk({});
    await api.cocktails.get(1);
    mockOk({});
    await api.cocktails.create({ name: 'Mojito' });
    mockOk({});
    await api.cocktails.update(1, { name: 'Negroni' });
    mockOk({ message: 'ok' });
    await api.cocktails.delete(1);
    mockOk({ version: 1 });
    await api.cocktails.exportRecipe(1);
    expect(mockFetch.mock.calls[5][0]).toBe('/api/cocktails/1/export');
  });

  it('should upload image with FormData', async () => {
    mockOk({});
    const api = await getApi();
    const file = new File(['img'], 'test.jpg', { type: 'image/jpeg' });
    await api.cocktails.uploadImage(1, file);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/cocktails/1/image');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    // FormData should NOT have Content-Type set (browser sets it with boundary)
    expect(opts.headers['Content-Type']).toBeUndefined();
  });

  it('should call import preview and confirm', async () => {
    const api = await getApi();
    mockOk({});
    await api.cocktails.importPreview({ version: 1, exportedAt: '', cocktail: { name: 'X', description: null, notes: null, tags: [], ingredients: [], instructions: [] } });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/cocktails/import/preview');

    mockOk({});
    await api.cocktails.importConfirm({ recipe: { version: 1, exportedAt: '', cocktail: { name: 'X', description: null, notes: null, tags: [], ingredients: [], instructions: [] } }, resolutions: {} });
    expect(mockFetch.mock.calls[1][0]).toBe('/api/cocktails/import/confirm');
  });
});

describe('menus API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.menus.list();
    mockOk({});
    await api.menus.get(1);
    mockOk({});
    await api.menus.create({ name: 'Test', slug: 'test' });
    mockOk({});
    await api.menus.update(1, { name: 'Updated' });
    mockOk({ message: 'ok' });
    await api.menus.delete(1);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

describe('menuBottles API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.menuBottles.listByMenu(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/menu-bottles/menu/1');

    mockOk({});
    await api.menuBottles.create({ menuId: 1, bottleId: 2 });
    mockOk({});
    await api.menuBottles.update(1, { position: 0 });
    mockOk({ message: 'ok' });
    await api.menuBottles.delete(1);
    mockOk({ message: 'ok', added: 1, removed: 0 });
    await api.menuBottles.sync(1);
    expect(mockFetch.mock.calls[4][0]).toBe('/api/menu-bottles/menu/1/sync');
  });
});

describe('menuSections API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.menuSections.listByMenu(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/menu-sections/menu/1/sections');

    mockOk({});
    await api.menuSections.create(1, { name: 'Section' });
    mockOk({});
    await api.menuSections.update(1, { name: 'Updated' });
    mockOk({ message: 'ok' });
    await api.menuSections.delete(1);
    expect(mockFetch.mock.calls[3][0]).toBe('/api/menu-sections/sections/1');

    mockOk({ message: 'ok' });
    await api.menuSections.reorder(1, [1, 2, 3]);
    expect(mockFetch.mock.calls[4][0]).toBe('/api/menu-sections/menu/1/sections/reorder');
  });
});

describe('public API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.publicApi.listMenus();
    mockOk({});
    await api.publicApi.getMenu('summer');
    expect(mockFetch.mock.calls[1][0]).toBe('/api/public/menus/summer');

    mockOk({});
    await api.publicApi.getCocktail(1);
    mockOk({});
    await api.publicApi.exportCocktail(1);
    expect(mockFetch.mock.calls[3][0]).toBe('/api/public/cocktails/1/export');

    mockOk({});
    await api.publicApi.getSettings();
    expect(mockFetch.mock.calls[4][0]).toBe('/api/public/settings');
  });
});

describe('shortages API', () => {
  it('should call list endpoint', async () => {
    mockOk([]);
    const api = await getApi();
    await api.shortages.list();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/shortages');
  });
});

describe('availability API', () => {
  it('should call both endpoints', async () => {
    const api = await getApi();
    mockOk({});
    await api.availability.getCocktail(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/availability/cocktails/1');

    mockOk({});
    await api.availability.getAllCocktails();
    expect(mockFetch.mock.calls[1][0]).toBe('/api/availability/cocktails');
  });
});

describe('settings API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk({ siteName: 'Bar', siteIcon: '' });
    await api.settings.get();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/settings');

    mockOk({});
    await api.settings.update({ siteName: 'New', siteIcon: '🍸' });
    expect(mockFetch.mock.calls[1][1].method).toBe('PUT');

    mockOk({ id: 1, email: 'a@b.c' });
    await api.settings.updateProfile({ email: 'new@b.c' });
    expect(mockFetch.mock.calls[2][0]).toBe('/api/settings/profile');
  });
});

describe('categoryTypes API', () => {
  it('should call all endpoints', async () => {
    const api = await getApi();
    mockOk([]);
    await api.categoryTypes.list();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/category-types');

    mockOk({});
    await api.categoryTypes.create({ name: 'SPIRIT' });
    expect(mockFetch.mock.calls[1][1].method).toBe('POST');

    mockOk({});
    await api.categoryTypes.update('SPIRIT', { color: 'blue' });
    expect(mockFetch.mock.calls[2][0]).toBe('/api/category-types/SPIRIT');

    mockOk({ message: 'ok' });
    await api.categoryTypes.delete('SPIRIT');
    expect(mockFetch.mock.calls[3][1].method).toBe('DELETE');
  });
});

describe('backup API', () => {
  it('exportBackup triggers download on success with Content-Disposition filename', async () => {
    localStorage.setItem('token', 'tok');
    const fakeBlob = new Blob(['zip-data'], { type: 'application/zip' });
    const mockHeaders = new Map([['content-disposition', 'attachment; filename=backup-2024-01-01.zip']]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
      headers: {
        get: (key: string) => mockHeaders.get(key.toLowerCase()) ?? null,
      },
    });

    const mockClick = vi.fn();
    const mockAnchor = { click: mockClick, href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const api = await getApi();
    await api.backup.exportBackup();

    expect(mockFetch.mock.calls[0][0]).toBe('/api/backup/export');
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob);
    expect(mockAnchor.download).toBe('backup-2024-01-01.zip');
    expect(mockClick).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('exportBackup uses fallback filename when no Content-Disposition header', async () => {
    const fakeBlob = new Blob(['zip'], { type: 'application/zip' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
      headers: { get: () => null },
    });

    const mockClick = vi.fn();
    const mockAnchor = { click: mockClick, href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const api = await getApi();
    await api.backup.exportBackup();

    // Fallback filename matches pattern backup-YYYY-MM-DD.zip
    expect(mockAnchor.download).toMatch(/^backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(mockClick).toHaveBeenCalled();
  });

  it('exportBackup throws error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    const api = await getApi();
    await expect(api.backup.exportBackup()).rejects.toThrow('Server error');
  });

  it('exportBackup throws HTTP status when error response has no message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('not json')),
    });

    const api = await getApi();
    await expect(api.backup.exportBackup()).rejects.toThrow('HTTP 503');
  });

  it('importBackup sends FormData and returns json on success', async () => {
    localStorage.setItem('token', 'tok');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ imported: true }),
    });

    const api = await getApi();
    const file = new File(['backup-content'], 'backup.zip', { type: 'application/zip' });
    const result = await api.backup.importBackup(file);

    expect(mockFetch.mock.calls[0][0]).toBe('/api/backup/import');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(result).toEqual({ imported: true });
  });

  it('importBackup throws error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid backup file' }),
    });

    const api = await getApi();
    const file = new File(['bad'], 'bad.zip', { type: 'application/zip' });
    await expect(api.backup.importBackup(file)).rejects.toThrow('Invalid backup file');
  });

  it('importBackup throws HTTP status when error response has no message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.reject(new Error('not json')),
    });

    const api = await getApi();
    const file = new File(['x'], 'x.zip', { type: 'application/zip' });
    await expect(api.backup.importBackup(file)).rejects.toThrow('HTTP 422');
  });
});
