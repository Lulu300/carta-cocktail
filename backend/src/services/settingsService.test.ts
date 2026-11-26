import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  prisma,
} from '../test/helpers';
import { getOrCreateSettings } from './settingsService';

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
});

describe('getOrCreateSettings', () => {
  it('should return the existing settings untouched', async () => {
    expect(await getOrCreateSettings()).toMatchObject({
      id: 1,
      siteName: 'Test Carta',
      siteIcon: '',
    });
  });

  it('should create the schema defaults once, even for two calls at the same time', async () => {
    await prisma.siteSettings.deleteMany();
    const [first, second] = await Promise.all([getOrCreateSettings(), getOrCreateSettings()]);
    expect(first).toMatchObject({ id: 1, siteName: 'Carta Cocktail', siteIcon: '' });
    expect(second).toEqual(first);
    expect(await prisma.siteSettings.count()).toBe(1);
  });
});
