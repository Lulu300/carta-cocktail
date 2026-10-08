import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase, prisma } from '../test/helpers';
import { ensureAdmin } from './ensureAdmin';

const STRONG_PASSWORD = 'correct-horse-battery';
const PRODUCTION_ENV = { NODE_ENV: 'production', ADMIN_EMAIL: 'owner@bar.test', ADMIN_PASSWORD: STRONG_PASSWORD };

async function createExistingAdmin(password = 'changed-from-the-ui'): Promise<{ id: number; passwordHash: string }> {
  return prisma.user.create({
    data: { email: 'changed@bar.test', passwordHash: await bcrypt.hash(password, 4) },
  });
}

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
// No seedRequiredData(): these tests control whether an admin exists
beforeEach(async () => { await cleanDatabase(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('ensureAdmin without an existing admin', () => {
  it('should create the admin from the environment', async () => {
    const result = await ensureAdmin(prisma, PRODUCTION_ENV);

    expect(result).toBe('created');
    const admin = await prisma.user.findFirstOrThrow();
    expect(admin.email).toBe('owner@bar.test');
    expect(await bcrypt.compare(STRONG_PASSWORD, admin.passwordHash)).toBe(true);
  });

  it('should default the email to admin@carta.local', async () => {
    await ensureAdmin(prisma, { NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_PASSWORD });

    const admin = await prisma.user.findFirstOrThrow();
    expect(admin.email).toBe('admin@carta.local');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['the old default', 'admin123'],
    ['11 characters long', 'x'.repeat(11)],
  ])('should refuse a password that is %s and create no user', async (_label, password) => {
    await expect(
      ensureAdmin(prisma, { NODE_ENV: 'production', ADMIN_PASSWORD: password }),
    ).rejects.toThrow('ADMIN_PASSWORD must be set to at least 12 characters');

    expect(await prisma.user.count()).toBe(0);
  });

  it('should accept a short password in the test environment', async () => {
    const result = await ensureAdmin(prisma, { NODE_ENV: 'test', ADMIN_PASSWORD: 'short' });

    expect(result).toBe('created');
  });
});

describe('ensureAdmin with an existing admin', () => {
  it('should leave the admin untouched when ADMIN_RESET_PASSWORD is not set', async () => {
    const existing = await createExistingAdmin();

    const result = await ensureAdmin(prisma, PRODUCTION_ENV);

    expect(result).toBe('unchanged');
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(admin.email).toBe('changed@bar.test');
    expect(admin.passwordHash).toBe(existing.passwordHash);
  });

  it('should not require ADMIN_PASSWORD once the admin exists', async () => {
    await createExistingAdmin();

    await expect(ensureAdmin(prisma, { NODE_ENV: 'production' })).resolves.toBe('unchanged');
  });

  it('should reset email and password when ADMIN_RESET_PASSWORD is true', async () => {
    const existing = await createExistingAdmin();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await ensureAdmin(prisma, { ...PRODUCTION_ENV, ADMIN_RESET_PASSWORD: 'true' });

    expect(result).toBe('reset');
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(admin.email).toBe('owner@bar.test');
    expect(await bcrypt.compare(STRONG_PASSWORD, admin.passwordHash)).toBe(true);
    expect(log).toHaveBeenCalledWith('Admin credentials reset from environment (login email: owner@bar.test)');
    expect(String(log.mock.calls)).not.toContain(STRONG_PASSWORD);
  });

  it.each(['1', 'TRUE', 'yes'])('should ignore ADMIN_RESET_PASSWORD=%s and say so', async (flag) => {
    const existing = await createExistingAdmin();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await ensureAdmin(prisma, { ...PRODUCTION_ENV, ADMIN_RESET_PASSWORD: flag });

    expect(result).toBe('unchanged');
    expect(warn).toHaveBeenCalledWith(
      `ADMIN_RESET_PASSWORD='${flag}' is ignored: set it to exactly 'true' to reset the admin credentials`,
    );
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(admin.passwordHash).toBe(existing.passwordHash);
  });

  it('should not warn when ADMIN_RESET_PASSWORD is false', async () => {
    await createExistingAdmin();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await ensureAdmin(prisma, { ...PRODUCTION_ENV, ADMIN_RESET_PASSWORD: 'false' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('should warn, without changing it, when the admin still uses admin123', async () => {
    const existing = await createExistingAdmin('admin123');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await ensureAdmin(prisma, PRODUCTION_ENV);

    expect(result).toBe('unchanged');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("the admin password is still the old default 'admin123'"));
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(admin.passwordHash).toBe(existing.passwordHash);
  });

  it('should refuse a reset with a weak password and keep the current credentials', async () => {
    const existing = await createExistingAdmin();

    await expect(
      ensureAdmin(prisma, { NODE_ENV: 'production', ADMIN_PASSWORD: 'admin123', ADMIN_RESET_PASSWORD: 'true' }),
    ).rejects.toThrow('ADMIN_PASSWORD must be set to at least 12 characters');

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(admin.passwordHash).toBe(existing.passwordHash);
  });
});
