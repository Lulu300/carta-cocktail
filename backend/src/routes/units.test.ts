import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, seedUnit,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/units', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/units');
    expect(res.status).toBe(401);
  });

  it('should return all units sorted by name', async () => {
    await seedUnit({ name: 'Ounce', abbreviation: 'oz', conversionFactorToMl: 29.57 });
    await seedUnit({ name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 });

    const res = await request.get('/api/units').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Centilitre');
    expect(res.body[1].name).toBe('Ounce');
  });
});

describe('GET /api/units/:id', () => {
  it('should return 404 for non-existent unit', async () => {
    const res = await request.get('/api/units/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return unit', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });
    const res = await request.get(`/api/units/${unit.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Centilitre');
    expect(res.body.abbreviation).toBe('cl');
  });
});

describe('POST /api/units', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/units').set(authHeader()).send({ abbreviation: 'x' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if abbreviation is missing', async () => {
    const res = await request.post('/api/units').set(authHeader()).send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('should create unit with conversionFactorToMl', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .send({ name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 });
    expect(res.status).toBe(201);
    expect(res.body.conversionFactorToMl).toBe(10);
  });

  it('should create unit with null conversionFactorToMl', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .send({ name: 'Piece', abbreviation: 'pce' });
    expect(res.status).toBe(201);
    expect(res.body.conversionFactorToMl).toBeNull();
  });

  it('should store nameTranslations', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .send({ name: 'Centilitre', abbreviation: 'cl', nameTranslations: { fr: 'Centilitre' } });
    expect(res.status).toBe(201);
    expect(res.body.nameTranslations).toEqual({ fr: 'Centilitre' });
  });
});

describe('PUT /api/units/:id', () => {
  it('should update unit', async () => {
    const unit = await seedUnit();
    const res = await request.put(`/api/units/${unit.id}`).set(authHeader())
      .send({ name: 'Updated', abbreviation: 'upd' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
    expect(res.body.abbreviation).toBe('upd');
  });

  it('should update conversionFactorToMl', async () => {
    const unit = await seedUnit({ conversionFactorToMl: 10 });
    const res = await request.put(`/api/units/${unit.id}`).set(authHeader())
      .send({ conversionFactorToMl: 15 });
    expect(res.status).toBe(200);
    expect(res.body.conversionFactorToMl).toBe(15);
  });
});

describe('DELETE /api/units/:id', () => {
  it('should delete a unit', async () => {
    const unit = await seedUnit();
    const res = await request.delete(`/api/units/${unit.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });
});
