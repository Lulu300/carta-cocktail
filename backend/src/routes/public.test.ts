import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCocktail, seedCategory, seedBottle, seedUnit,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/public/menus', () => {
  it('should return empty array when no menus are public', async () => {
    const res = await request.get('/api/public/menus');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return only public menus', async () => {
    await prisma.menu.create({
      data: { name: 'Public Menu', slug: 'public-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Public Menu');
  });
});

describe('GET /api/public/menus/:slug', () => {
  it('should return 404 for non-existent menu', async () => {
    const res = await request.get('/api/public/menus/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-public menu without auth', async () => {
    // aperitifs is seeded as isPublic: false
    const res = await request.get('/api/public/menus/aperitifs');
    expect(res.status).toBe(404);
  });

  it('should allow admin preview of non-public menu', async () => {
    const res = await request.get('/api/public/menus/aperitifs').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('aperitifs');
  });

  it('should return public menu with sections, cocktails, bottles', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Open Menu', slug: 'open-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus/open-menu');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sections');
    expect(res.body).toHaveProperty('cocktails');
    expect(res.body).toHaveProperty('bottles');
  });
});

describe('GET /api/public/settings', () => {
  it('should return site settings without auth', async () => {
    const res = await request.get('/api/public/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('siteName');
    expect(res.body).toHaveProperty('siteIcon');
  });
});

describe('GET /api/public/cocktails/:id', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999');
    expect(res.status).toBe(404);
  });

  it('should return cocktail with ingredients and instructions', async () => {
    const cocktail = await seedCocktail({ name: 'Public Mojito' });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Public Mojito');
  });
});

describe('GET /api/public/cocktails/:id/export', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999/export');
    expect(res.status).toBe(404);
  });

  it('should return export payload with version=1', async () => {
    const cocktail = await seedCocktail({ name: 'Export Public' });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cocktail.name).toBe('Export Public');
    expect(res.headers['content-disposition']).toContain('cocktail-export-public.json');
  });
});
