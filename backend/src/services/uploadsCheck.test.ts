import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma } from '../test/helpers';
import {
  checkUploads, formatUploadsWarnings, isOnMount, parseMountPoints, reportUploadsCheck, UploadsCheckResult,
} from './uploadsCheck';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

// Shortened /proc/self/mountinfo lines of a backend container
function mountInfoLine(mountPoint: string): string {
  return `100 90 0:50 / ${mountPoint} rw,relatime - ext4 /dev/vda1 rw`;
}
const OVERLAY_ROOT = '90 1 0:45 / / rw,relatime master:1 - overlay overlay rw,lowerdir=/x';

let tmpDir: string;
let uploadDir: string;
let mountInfoPath: string;
let dockerMarker: string;

function writeMountInfo(...mountPoints: string[]): void {
  fs.writeFileSync(mountInfoPath, [OVERLAY_ROOT, ...mountPoints.map(mountInfoLine)].join('\n') + '\n');
}

function markAsContainer(): void {
  fs.writeFileSync(dockerMarker, '');
}

async function seedCocktailWithPhoto(name: string, imagePath: string | null) {
  return prisma.cocktail.create({ data: { name, tags: '', imagePath } });
}

function options() {
  return { uploadDir, mountInfoPath, containerMarkers: [dockerMarker] };
}

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'carta-uploads-check-')));
  uploadDir = path.join(tmpDir, 'uploads');
  fs.mkdirSync(uploadDir);
  mountInfoPath = path.join(tmpDir, 'mountinfo');
  dockerMarker = path.join(tmpDir, '.dockerenv');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseMountPoints', () => {
  it('reads the 5th field of each line and decodes octal escapes', () => {
    const mountInfo = `${OVERLAY_ROOT}\n${mountInfoLine('/app/my\\040photos')}\n\n`;

    expect(parseMountPoints(mountInfo)).toEqual(['/', '/app/my photos']);
  });
});

describe('isOnMount', () => {
  it('is true for a mount point and for a folder inside one', () => {
    expect(isOnMount('/app/uploads', ['/', '/app/uploads'])).toBe(true);
    expect(isOnMount('/app/data/uploads', ['/', '/app/data'])).toBe(true);
  });

  it('ignores the root file system and mounts beside the folder', () => {
    expect(isOnMount('/app/uploads', ['/', '/uploads', '/app/data', '/app/uploads-old'])).toBe(false);
  });
});

describe('checkUploads', () => {
  it('reports a container whose upload folder is not a mount', async () => {
    markAsContainer();
    writeMountInfo('/uploads', '/app/data');

    const result = await checkUploads(prisma, options());

    expect(result).toEqual({
      uploadDir, inContainer: true, onMount: false, referencedPhotos: 0, missingPhotos: 0,
    });
  });

  it('reports a mounted upload folder', async () => {
    markAsContainer();
    writeMountInfo(uploadDir);

    const result = await checkUploads(prisma, options());

    expect(result.onMount).toBe(true);
  });

  it('follows symbolic links before comparing with the mount table', async () => {
    const link = path.join(tmpDir, 'link');
    fs.symlinkSync(uploadDir, link);
    writeMountInfo(uploadDir);

    const result = await checkUploads(prisma, { ...options(), uploadDir: link });

    expect(result.onMount).toBe(true);
  });

  it('leaves the mount state unknown when the mount table cannot be read', async () => {
    const result = await checkUploads(prisma, options());

    expect(result.inContainer).toBe(false);
    expect(result.onMount).toBeNull();
  });

  it('counts the referenced photos that are missing from the folder', async () => {
    fs.writeFileSync(path.join(uploadDir, 'present.jpg'), '');
    await seedCocktailWithPhoto('With photo', 'present.jpg');
    await seedCocktailWithPhoto('Lost photo', 'lost.jpg');
    await seedCocktailWithPhoto('Other lost photo', 'other-lost.jpg');
    await seedCocktailWithPhoto('No photo', null);

    const result = await checkUploads(prisma, options());

    expect(result.referencedPhotos).toBe(3);
    expect(result.missingPhotos).toBe(2);
  });

  it('counts nothing when all referenced photos are present', async () => {
    fs.writeFileSync(path.join(uploadDir, 'present.jpg'), '');
    await seedCocktailWithPhoto('With photo', 'present.jpg');

    const result = await checkUploads(prisma, options());

    expect(result.referencedPhotos).toBe(1);
    expect(result.missingPhotos).toBe(0);
  });
});

describe('formatUploadsWarnings', () => {
  const healthy: UploadsCheckResult = {
    uploadDir: '/app/uploads', inContainer: true, onMount: true, referencedPhotos: 42, missingPhotos: 0,
  };

  it('returns nothing when everything is fine', () => {
    expect(formatUploadsWarnings(healthy)).toEqual([]);
  });

  it('does not warn about the mount outside a container or when it is unknown', () => {
    expect(formatUploadsWarnings({ ...healthy, inContainer: false, onMount: false })).toEqual([]);
    expect(formatUploadsWarnings({ ...healthy, onMount: null })).toEqual([]);
  });

  it('warns about an upload folder that is not a mount, with the folder and the guide', () => {
    const [warning] = formatUploadsWarnings({ ...healthy, onMount: false });

    expect(warning).toContain('/app/uploads is not a mounted volume or host folder');
    // Mounting the folder recreates the container: the photos inside must be copied out first
    expect(warning).toContain('Before recreating it, copy them out with `docker cp <backend container>:/app/uploads/. ./uploads-rescue/`');
    expect(warning).toContain('UPGRADING.md#v160');
  });

  it('gives the number of missing photos, even outside a container', () => {
    const warnings = formatUploadsWarnings({ ...healthy, inContainer: false, missingPhotos: 42 });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('42 of 42 cocktail photos are missing from /app/uploads');
    expect(warnings[0]).toContain('UPGRADING.md#v150');
  });
});

describe('reportUploadsCheck', () => {
  it('logs nothing when everything is fine', async () => {
    const logger = { warn: vi.fn() };
    markAsContainer();
    writeMountInfo(uploadDir);

    const result = await reportUploadsCheck(prisma, options(), logger);

    expect(result?.onMount).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs counts and the folder, never file or cocktail names', async () => {
    const logger = { warn: vi.fn() };
    markAsContainer();
    writeMountInfo('/uploads');
    await seedCocktailWithPhoto('Secret Cocktail', 'secret-photo.jpg');

    await reportUploadsCheck(prisma, options(), logger);

    const logged = logger.warn.mock.calls.flat().join('\n');
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logged).toContain(`1 of 1 cocktail photos are missing from ${uploadDir}`);
    expect(logged).not.toContain('secret-photo');
    expect(logged).not.toContain('Secret Cocktail');
  });

  it('logs a warning instead of throwing when the check fails', async () => {
    const logger = { warn: vi.fn() };
    const failingDb = {
      cocktail: { findMany: () => Promise.reject(new Error('no such table: Cocktail')) },
    } as unknown as Parameters<typeof reportUploadsCheck>[0];

    const result = await reportUploadsCheck(failingDb, options(), logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      `[uploads] Startup check of ${uploadDir} skipped: no such table: Cocktail`,
    );
  });

  it('logs only the first line of a multi-line error message', async () => {
    const logger = { warn: vi.fn() };
    const failingDb = {
      cocktail: { findMany: () => Promise.reject(new Error('\nInvalid invocation in\n/app/dist/services/uploadsCheck.js:80:1\n')) },
    } as unknown as Parameters<typeof reportUploadsCheck>[0];

    await reportUploadsCheck(failingDb, options(), logger);

    expect(logger.warn).toHaveBeenCalledWith(`[uploads] Startup check of ${uploadDir} skipped: Invalid invocation in`);
  });

  it('logs the error code of a Prisma error instead of its message', async () => {
    const logger = { warn: vi.fn() };
    // The cocktail table does not exist in a database that was never migrated
    const missingTable = await prisma.$queryRawUnsafe('SELECT * FROM "NoSuchTable"').catch((error: unknown) => error);
    const failingDb = {
      cocktail: { findMany: () => Promise.reject(missingTable) },
    } as unknown as Parameters<typeof reportUploadsCheck>[0];

    await reportUploadsCheck(failingDb, options(), logger);

    const [line] = logger.warn.mock.calls[0];
    expect(line).toMatch(/skipped: PrismaClientKnownRequestError P\d{4}$/);
  });

  it('also survives a check that fails with something other than an Error', async () => {
    const logger = { warn: vi.fn() };
    const failingDb = {
      cocktail: { findMany: () => Promise.reject('database is locked') },
    } as unknown as Parameters<typeof reportUploadsCheck>[0];

    const result = await reportUploadsCheck(failingDb, options(), logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(`[uploads] Startup check of ${uploadDir} skipped: database is locked`);
  });
});
