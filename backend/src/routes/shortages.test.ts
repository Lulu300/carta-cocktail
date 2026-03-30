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
    // desiredStock=1, minimumPercent=30 → required=30%, bottle at 100% → 100% >= 30%
    const cat = await seedCategory({ name: 'Vodka', desiredStock: 1 });
    await seedBottle({ name: 'Vodka 1', categoryId: cat.id });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should detect shortage when total percent < required', async () => {
    // desiredStock=3, minimumPercent=30 → required=230%, 1 bottle at 100% → 100% < 230%
    const cat = await seedCategory({ name: 'Rum', desiredStock: 3 });
    await seedBottle({ name: 'Rum 1', categoryId: cat.id });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category.name).toBe('Rum');
    expect(res.body[0].totalPercent).toBe(100);
    expect(res.body[0].requiredPercent).toBe(230);
    expect(res.body[0].isShortage).toBe(true);
  });

  it('should not flag shortage when total percent meets threshold', async () => {
    // desiredStock=1, minimumPercent=30 → required=30%, bottle at 50% → 50% >= 30%
    const cat = await seedCategory({ name: 'Gin', desiredStock: 1, minimumPercent: 30 });
    await prisma.bottle.create({
      data: { name: 'Gin Half', categoryId: cat.id, capacityMl: 700, remainingPercent: 50 },
    });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should detect shortage when single bottle drops below minimumPercent', async () => {
    // desiredStock=1, minimumPercent=30 → required=30%, bottle at 20% → 20% < 30%
    const cat = await seedCategory({ name: 'Whisky', desiredStock: 1, minimumPercent: 30 });
    await prisma.bottle.create({
      data: { name: 'Whisky Low', categoryId: cat.id, capacityMl: 700, remainingPercent: 20 },
    });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].totalPercent).toBe(20);
    expect(res.body[0].requiredPercent).toBe(30);
  });

  it('should sum percentages across multiple bottles', async () => {
    // desiredStock=1, minimumPercent=30 → required=30%
    // 4 bottles at 5% each → total=20% < 30% → shortage
    const cat = await seedCategory({ name: 'Tequila', desiredStock: 1, minimumPercent: 30 });
    for (let i = 0; i < 4; i++) {
      await prisma.bottle.create({
        data: { name: `T${i}`, categoryId: cat.id, capacityMl: 700, remainingPercent: 5 },
      });
    }

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].totalPercent).toBe(20);
    expect(res.body[0].requiredPercent).toBe(30);
    expect(res.body[0].totalUsable).toBe(4);
  });

  it('should handle desiredStock=3 with mixed bottles correctly', async () => {
    // desiredStock=3, minimumPercent=30 → required=230%
    // 2 full (200%) + 1 at 40% = 240% >= 230% → no shortage
    const cat = await seedCategory({ name: 'Bourbon', desiredStock: 3, minimumPercent: 30 });
    await seedBottle({ name: 'B1', categoryId: cat.id });
    await seedBottle({ name: 'B2', categoryId: cat.id });
    await prisma.bottle.create({
      data: { name: 'B3', categoryId: cat.id, capacityMl: 700, remainingPercent: 40 },
    });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should detect shortage with desiredStock=3 when last bottle is below threshold', async () => {
    // desiredStock=3, minimumPercent=30 → required=230%
    // 2 full (200%) + 1 at 29% = 229% < 230% → shortage
    const cat = await seedCategory({ name: 'Mezcal', desiredStock: 3, minimumPercent: 30 });
    await seedBottle({ name: 'M1', categoryId: cat.id });
    await seedBottle({ name: 'M2', categoryId: cat.id });
    await prisma.bottle.create({
      data: { name: 'M3', categoryId: cat.id, capacityMl: 700, remainingPercent: 29 },
    });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].totalPercent).toBe(229);
    expect(res.body[0].requiredPercent).toBe(230);
  });

  it('should not count empty bottles in total percent', async () => {
    // Empty bottle (0%) should contribute 0 to the sum
    const cat = await seedCategory({ name: 'Absinthe', desiredStock: 1 });
    await seedBottle({ name: 'Empty', categoryId: cat.id, remainingPercent: 0 });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].totalPercent).toBe(0);
    expect(res.body[0].totalUsable).toBe(0);
  });

  it('should include categoryType metadata', async () => {
    await seedCategory({ name: 'Whiskey', desiredStock: 2 });

    const res = await request.get('/api/shortages').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category.categoryType).toBeDefined();
    expect(res.body[0].category.categoryType.name).toBe('SPIRIT');
  });
});
