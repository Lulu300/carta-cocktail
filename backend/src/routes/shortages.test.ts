import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/shortages', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/shortages');
    expect(res.status).toBe(401);
  });

  it('should return empty array when no shortages', async () => {
    // Create a category with desiredStock=1 and one sealed bottle
    const cat = await seedCategory({ name: 'Vodka', desiredStock: 1 });
    await seedBottle({ name: 'Vodka 1', categoryId: cat.id });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should detect shortage when sealed count < desiredStock', async () => {
    const cat = await seedCategory({ name: 'Rum', desiredStock: 3 });
    // Only 1 sealed bottle, need 3
    await seedBottle({ name: 'Rum 1', categoryId: cat.id });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category.name).toBe('Rum');
    expect(res.body[0].sealedCount).toBe(1);
    expect(res.body[0].deficit).toBe(2);
    expect(res.body[0].isShortage).toBe(true);
  });

  it('should only count sealed (unopened) bottles', async () => {
    const cat = await seedCategory({ name: 'Gin', desiredStock: 2 });
    // 1 sealed + 1 opened = only 1 sealed
    await seedBottle({ name: 'Gin Sealed', categoryId: cat.id });
    await prisma.bottle.create({
      data: {
        name: 'Gin Opened', categoryId: cat.id, capacityMl: 700,
        remainingPercent: 50, openedAt: new Date(),
      },
    });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sealedCount).toBe(1);
  });

  it('should not count empty bottles', async () => {
    const cat = await seedCategory({ name: 'Tequila', desiredStock: 1 });
    // Empty bottle should not count
    await seedBottle({ name: 'Empty', categoryId: cat.id, remainingPercent: 0 });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sealedCount).toBe(0);
    expect(res.body[0].deficit).toBe(1);
  });

  it('should include categoryType metadata', async () => {
    const cat = await seedCategory({ name: 'Whiskey', desiredStock: 2 });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category.categoryType).toBeDefined();
    expect(res.body[0].category.categoryType.name).toBe('SPIRIT');
  });
});
