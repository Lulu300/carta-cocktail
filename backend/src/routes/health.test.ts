import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, request, prisma } from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('answers 200 without a token', async () => {
    vi.stubEnv('APP_VERSION', undefined);
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'dev' });
  });

  it('reports APP_VERSION when it is set', async () => {
    vi.stubEnv('APP_VERSION', '1.12.0');
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '1.12.0' });
  });

  it('answers 503 with the status only when the database query fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('SQLITE_CANTOPEN: /app/data/carta_cocktail.db'));
    const res = await request.get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });
});
