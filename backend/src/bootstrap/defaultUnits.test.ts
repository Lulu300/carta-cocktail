import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase, prisma, seedUnit } from '../test/helpers';
import { ensureDefaultUnits } from './defaultUnits';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); });

async function abbreviationsLike(abbreviation: string): Promise<string[]> {
  const units = await prisma.unit.findMany({ orderBy: { id: 'asc' } });
  return units.map((unit) => unit.abbreviation).filter((value) => value.toLowerCase() === abbreviation);
}

describe('ensureDefaultUnits', () => {
  it('should create the default units once', async () => {
    await ensureDefaultUnits(prisma);
    const count = await prisma.unit.count();
    await ensureDefaultUnits(prisma);

    expect(count).toBeGreaterThan(0);
    expect(await prisma.unit.count()).toBe(count);
    expect(await prisma.unit.findUnique({ where: { abbreviation: 'cl' } })).toMatchObject({ conversionFactorToMl: 10 });
  });

  it('should not create cl again after the admin changed it into CL', async () => {
    await ensureDefaultUnits(prisma);
    await prisma.unit.update({ where: { abbreviation: 'cl' }, data: { abbreviation: 'CL' } });

    await ensureDefaultUnits(prisma);

    expect(await abbreviationsLike('cl')).toEqual(['CL']);
  });

  it('should leave units that differ only by case as they are, and add none', async () => {
    await seedUnit({ abbreviation: 'CL', nameTranslations: null });
    await seedUnit({ abbreviation: 'Cl', nameTranslations: null });

    await ensureDefaultUnits(prisma);

    expect(await abbreviationsLike('cl')).toEqual(['CL', 'Cl']);
    const units = await prisma.unit.findMany({ where: { abbreviation: { in: ['CL', 'Cl'] } } });
    expect(units.map((unit) => unit.nameTranslations)).toEqual([null, null]);
    expect(await prisma.unit.findUnique({ where: { abbreviation: 'ml' } })).not.toBeNull();
  });

  it('should give its translations to a default unit found in another case that has none', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'CL', nameTranslations: null });

    await ensureDefaultUnits(prisma);

    const updated = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(JSON.parse(updated.nameTranslations ?? '{}')).toEqual({ fr: 'Centilitre', en: 'Centiliter' });
  });

  it('should keep the translations a unit already has', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', nameTranslations: JSON.stringify({ en: 'Centilitre (EU)' }) });

    await ensureDefaultUnits(prisma);

    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).nameTranslations)
      .toBe(JSON.stringify({ en: 'Centilitre (EU)' }));
  });
});
