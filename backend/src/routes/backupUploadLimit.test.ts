import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, request, authHeader,
} from '../test/helpers';

// A small stand-in for MAX_BACKUP_UPLOAD_BYTES: the tests check how the route applies the
// limit without sending 200 MiB. vi.hoisted makes it available to the hoisted vi.mock.
const { UPLOAD_LIMIT } = vi.hoisted(() => ({ UPLOAD_LIMIT: 64 * 1024 }));

vi.mock('../services/backupService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/backupService')>(),
  MAX_BACKUP_UPLOAD_BYTES: UPLOAD_LIMIT,
}));

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

function importArchiveOf(size: number) {
  return request.post('/api/backup/import').set(authHeader()).attach('backup', Buffer.alloc(size), 'backup.zip');
}

describe('POST /api/backup/import - upload limit', () => {
  // Not a zip: the 400 shows that the archive went past the upload limit to the archive checks
  it.each([
    ['one byte under the limit', UPLOAD_LIMIT - 1],
    ['exactly the limit', UPLOAD_LIMIT],
  ])('should read an archive of %s', async (_case, size) => {
    const res = await importArchiveOf(size);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid backup file');
  });

  it('should answer 413 for an archive one byte over the limit', async () => {
    const res = await importArchiveOf(UPLOAD_LIMIT + 1);

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('The file or request is too large');
  });
});
