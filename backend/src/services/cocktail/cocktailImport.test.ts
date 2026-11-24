import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  prisma, seedUnit, seedCategory, seedBottle, seedIngredient, seedCocktail,
} from '../../test/helpers';
import { ImportRecipeV1, ImportResolutions } from '../../validation/cocktailImport';
import { confirmImport, previewImport } from './cocktailImport';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

const CL = { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 };

// Parsed like the routes do, so schema defaults apply
function recipe(ingredients: unknown[], name = 'Imported') {
  return ImportRecipeV1.parse({ version: 1, cocktail: { name, ingredients, instructions: [{ text: 'Shake' }] } }).cocktail;
}

function resolutions(value: unknown) {
  return ImportResolutions.parse(value);
}

const rumBottleLine = {
  sourceType: 'BOTTLE',
  sourceName: 'Havana',
  sourceDetail: { categoryName: 'Rum', categoryType: 'SPIRIT' },
  quantity: 4,
  unit: CL,
};

async function rowCounts() {
  return {
    cocktails: await prisma.cocktail.count(),
    lines: await prisma.cocktailIngredient.count(),
    units: await prisma.unit.count(),
    categories: await prisma.category.count(),
    bottles: await prisma.bottle.count(),
    ingredients: await prisma.ingredient.count(),
  };
}

async function expectUnresolved(promise: Promise<unknown>, details: unknown[]) {
  await expect(promise).rejects.toMatchObject({ status: 400, i18nKey: 'errors.importUnresolved', details });
}

describe('previewImport', () => {
  it('should report a cocktail of the same name whatever its case', async () => {
    await seedCocktail({ name: 'Mojito' });

    const preview = await previewImport(recipe([], 'mOJITO'));
    expect(preview.cocktail.alreadyExists).toBe(true);
  });

  it('should not report a cocktail whose name only starts the same', async () => {
    await seedCocktail({ name: 'Mojito Royal' });

    const preview = await previewImport(recipe([], 'Mojito'));
    expect(preview.cocktail.alreadyExists).toBe(false);
  });

  it('should name an existing match after the compared field', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'CL' });
    const category = await seedCategory({ name: 'Rum' });

    const preview = await previewImport(recipe([
      { sourceType: 'CATEGORY', sourceName: 'rum', quantity: 4, unit: { abbreviation: 'cl' } },
    ]));
    expect(preview.units[0]).toMatchObject({ status: 'matched', existingMatch: { id: unit.id, name: 'CL' } });
    expect(preview.categories[0]).toMatchObject({ status: 'matched', existingMatch: { id: category.id, name: 'Rum' } });
  });

  it('should send the translations of an existing match as an object', async () => {
    await seedCategory({ name: 'Rum', nameTranslations: JSON.stringify({ fr: 'Rhum' }) });

    const preview = await previewImport(recipe([
      { sourceType: 'CATEGORY', sourceName: 'rum', quantity: 4, unit: { abbreviation: 'cl' } },
    ]));
    expect(preview.categories[0].existingMatch).toMatchObject({ name: 'Rum', nameTranslations: { fr: 'Rhum' } });
  });

  it('should not list the preferred bottles of a line that is not a category line', async () => {
    const preview = await previewImport(recipe([
      { ...rumBottleLine, preferredBottles: [{ name: 'Diplomatico' }] },
    ]));
    expect(preview.bottles.map((entity) => entity.ref.name)).toEqual(['Havana']);
  });

  it('should keep the refs of every kind of entity', async () => {
    const preview = await previewImport(recipe([
      rumBottleLine,
      { sourceType: 'INGREDIENT', sourceName: 'Mint', sourceDetail: { icon: '🌿' }, quantity: 1, unit: CL },
      {
        sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL,
        preferredBottles: [{ name: 'Tanqueray', categoryName: 'Gin' }],
      },
    ]));
    expect(preview.units).toEqual([{ ref: { ...CL, nameTranslations: null }, existingMatch: null, status: 'missing' }]);
    expect(preview.bottles.map((entity) => entity.ref)).toEqual([
      { name: 'Havana', categoryName: 'Rum', categoryType: 'SPIRIT' },
      { name: 'Tanqueray', categoryName: 'Gin', categoryType: 'SPIRIT' },
    ]);
    expect(preview.categories.map((entity) => entity.ref)).toEqual([
      { name: 'Rum', type: 'SPIRIT', desiredStock: 1, nameTranslations: null },
      { name: 'Gin', type: 'SPIRIT', desiredStock: 1, nameTranslations: null },
    ]);
    expect(preview.ingredients[0].ref).toEqual({ name: 'Mint', icon: '🌿', nameTranslations: null });
  });
});

describe('confirmImport - unresolved references', () => {
  it('should refuse a line whose unit is not resolved and create nothing', async () => {
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(recipe([{ ...rumBottleLine, sourceType: 'INGREDIENT', sourceName: 'Lime' }]), resolutions({
        ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
      })),
      [{ line: 0, kind: 'unit', name: 'cl' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should refuse a line without unit', async () => {
    const lime = await seedIngredient({ name: 'Lime' });

    await expectUnresolved(
      confirmImport(recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1 }]), resolutions({
        ingredients: { lime: { action: 'use_existing', existingId: lime.id } },
      })),
      [{ line: 0, kind: 'unit', name: null }],
    );
  });

  it('should fall back on the category of a skipped bottle', async () => {
    const unit = await seedUnit();
    const rum = await seedCategory({ name: 'Rum' });

    const cocktail = await confirmImport(recipe([rumBottleLine]), resolutions({
      units: { cl: { action: 'use_existing', existingId: unit.id } },
      categories: { rum: { action: 'use_existing', existingId: rum.id } },
      bottles: { havana: { action: 'skip' } },
    }));
    expect(cocktail.ingredients).toMatchObject([
      { sourceType: 'CATEGORY', categoryId: rum.id, bottleId: null, ingredientId: null, unitId: unit.id },
    ]);
  });

  it('should refuse a skipped bottle whose category is not resolved and write nothing', async () => {
    const unit = await seedUnit();
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(recipe([rumBottleLine]), resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { rum: { action: 'skip' } },
        bottles: { havana: { action: 'skip' } },
      })),
      [{ line: 0, kind: 'bottle', name: 'Havana' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should refuse a bottle to create without a resolved category', async () => {
    const unit = await seedUnit();
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(recipe([rumBottleLine]), resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { rum: { action: 'skip' } },
        bottles: { havana: { action: 'create', data: { name: 'Havana Club 3', categoryName: 'Rum', capacityMl: 700 } } },
      })),
      // Named as in the file, not as the admin renamed it
      [{ line: 0, kind: 'bottle', name: 'Havana' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should give the line of a preferred bottle to create without category', async () => {
    const unit = await seedUnit();
    const gin = await seedCategory({ name: 'Gin' });

    await expectUnresolved(
      confirmImport(recipe([
        { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL },
        { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 1, unit: CL, preferredBottles: [{ name: 'Tanqueray' }] },
      ]), resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { gin: { action: 'use_existing', existingId: gin.id } },
        bottles: { tanqueray: { action: 'create', data: { name: 'Tanqueray', capacityMl: 700 } } },
      })),
      [{ line: 1, kind: 'bottle', name: 'Tanqueray' }],
    );
  });

  it('should list every unresolved line at once', async () => {
    await expectUnresolved(
      confirmImport(recipe([
        { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL },
        { sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL },
      ]), resolutions({})),
      [
        { line: 0, kind: 'unit', name: 'cl' },
        { line: 0, kind: 'category', name: 'Gin' },
        { line: 1, kind: 'unit', name: 'cl' },
        { line: 1, kind: 'ingredient', name: 'Lime' },
      ],
    );
  });

  it('should refuse a use_existing choice without id', async () => {
    const unit = await seedUnit();

    await expectUnresolved(
      confirmImport(recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]), resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        ingredients: { lime: { action: 'use_existing' } },
      })),
      [{ line: 0, kind: 'ingredient', name: 'Lime' }],
    );
  });

  it('should answer unknownReference for an existing id that names no row', async () => {
    const unit = await seedUnit();

    await expect(confirmImport(
      recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]),
      resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        ingredients: { lime: { action: 'use_existing', existingId: 99999 } },
      }),
    )).rejects.toMatchObject({
      status: 400,
      i18nKey: 'errors.unknownReference',
      details: [{ line: 0, field: 'ingredientId', id: 99999 }],
    });
    expect(await prisma.cocktail.count()).toBe(0);
  });
});

describe('confirmImport - recipe lines', () => {
  it('should write every line with its unit and the key of its source type', async () => {
    const cocktail = await confirmImport(recipe([
      rumBottleLine,
      { sourceType: 'CATEGORY', sourceName: 'Rum', quantity: 2, unit: CL },
      { sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL },
    ]), resolutions({
      units: { cl: { action: 'create', data: CL } },
      categories: { rum: { action: 'create', data: { name: 'Rum' } } },
      bottles: { havana: { action: 'create', data: { name: 'Havana', categoryName: 'Rum', capacityMl: 700 } } },
      ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
    }));

    expect(cocktail.ingredients.map((line) => line.sourceType)).toEqual(['BOTTLE', 'CATEGORY', 'INGREDIENT']);
    const orphans = await prisma.cocktailIngredient.count({
      where: {
        OR: [
          { sourceType: 'BOTTLE', bottleId: null },
          { sourceType: 'CATEGORY', categoryId: null },
          { sourceType: 'INGREDIENT', ingredientId: null },
        ],
      },
    });
    expect(orphans).toBe(0);
    expect(cocktail.instructions).toMatchObject([{ stepNumber: 1, text: 'Shake' }]);
  });

  it('should create a bottle in the category named by the file when the admin clears it', async () => {
    const cocktail = await confirmImport(recipe([rumBottleLine]), resolutions({
      units: { cl: { action: 'create', data: CL } },
      categories: { rum: { action: 'create', data: { name: 'Rum' } } },
      bottles: { havana: { action: 'create', data: { name: 'Havana', categoryName: '', capacityMl: 700 } } },
    }));

    const rum = await prisma.category.findUniqueOrThrow({ where: { name: 'Rum' } });
    expect(cocktail.ingredients[0].bottle).toMatchObject({ name: 'Havana', categoryId: rum.id });
  });

  it('should keep the resolved preferred bottles of a category line and drop the skipped ones', async () => {
    const unit = await seedUnit();
    const gin = await seedCategory({ name: 'Gin' });
    const tanqueray = await seedBottle({ name: 'Tanqueray', categoryId: gin.id });

    const cocktail = await confirmImport(recipe([{
      sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL,
      preferredBottles: [{ name: 'Tanqueray', categoryName: 'Gin' }, { name: 'Bombay', categoryName: 'Gin' }],
    }]), resolutions({
      units: { cl: { action: 'use_existing', existingId: unit.id } },
      categories: { gin: { action: 'use_existing', existingId: gin.id } },
      bottles: { tanqueray: { action: 'use_existing', existingId: tanqueray.id }, bombay: { action: 'skip' } },
    }));

    expect(cocktail.ingredients[0].preferredBottles.map((preferred) => preferred.bottleId)).toEqual([tanqueray.id]);
  });

  it('should drop the preferred bottles of a line that is not a category line', async () => {
    const unit = await seedUnit();
    const rum = await seedCategory({ name: 'Rum' });
    const havana = await seedBottle({ name: 'Havana', categoryId: rum.id });
    const other = await seedBottle({ name: 'Diplomatico', categoryId: rum.id });

    const cocktail = await confirmImport(recipe([{
      ...rumBottleLine, preferredBottles: [{ name: 'Diplomatico', categoryName: 'Rum' }],
    }]), resolutions({
      units: { cl: { action: 'use_existing', existingId: unit.id } },
      categories: { rum: { action: 'use_existing', existingId: rum.id } },
      bottles: {
        havana: { action: 'use_existing', existingId: havana.id },
        diplomatico: { action: 'use_existing', existingId: other.id },
      },
    }));

    expect(cocktail.ingredients[0]).toMatchObject({ sourceType: 'BOTTLE', bottleId: havana.id, preferredBottles: [] });
  });

  it('should collapse the inner spaces of a category type it creates', async () => {
    const cocktail = await confirmImport(recipe([{ sourceType: 'CATEGORY', sourceName: 'Mezcal', quantity: 2, unit: CL }]), resolutions({
      units: { cl: { action: 'create', data: CL } },
      categories: { mezcal: { action: 'create', data: { name: 'Mezcal', type: 'AGAVE   SPIRIT' } } },
    }));

    expect(cocktail.ingredients[0].category).toMatchObject({ name: 'Mezcal', type: 'AGAVE SPIRIT' });
    expect(await prisma.categoryType.findUnique({ where: { name: 'AGAVE   SPIRIT' } })).toBeNull();
  });

  // Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT': the wizard lists both, and the
  // category goes under the one picked, as when it is created by hand (C-57)
  describe('type picked for a category to create', () => {
    /** Imports one category line per category, each category created under the type given. */
    function importUnderTypes(typesByCategory: Record<string, string>) {
      const names = Object.keys(typesByCategory);
      const lines = names.map((name) => ({ sourceType: 'CATEGORY', sourceName: name, quantity: 2, unit: CL }));
      const categories = Object.fromEntries(names.map((name) => [
        name.toLowerCase(), { action: 'create', data: { name, type: typesByCategory[name] } },
      ]));
      return confirmImport(recipe(lines), resolutions({ units: { cl: { action: 'create', data: CL } }, categories }));
    }

    async function typeOf(categoryName: string) {
      return (await prisma.category.findUniqueOrThrow({ where: { name: categoryName } })).type;
    }

    it('should keep an existing type with surrounding spaces, and create no type', async () => {
      await prisma.categoryType.create({ data: { name: ' AGAVE ', color: 'red' } });
      const typeCount = await prisma.categoryType.count();

      await importUnderTypes({ Mezcal: ' AGAVE ' });

      expect(await typeOf('Mezcal')).toBe(' AGAVE ');
      expect(await prisma.categoryType.count()).toBe(typeCount);
    });

    it("should file each category under the type picked when ' SPIRIT ' and 'SPIRIT' both exist", async () => {
      await prisma.categoryType.create({ data: { name: ' SPIRIT ', color: 'red' } });
      const typesBefore = await prisma.categoryType.findMany({ orderBy: { name: 'asc' } });

      await importUnderTypes({ Mezcal: ' SPIRIT ', Gin: 'SPIRIT' });

      expect(await typeOf('Mezcal')).toBe(' SPIRIT ');
      expect(await typeOf('Gin')).toBe('SPIRIT');
      expect(await prisma.categoryType.findMany({ orderBy: { name: 'asc' } })).toEqual(typesBefore);
    });

    it('should trim and collapse a new type, created in gray', async () => {
      await importUnderTypes({ Mezcal: ' agave  x ' });

      expect(await typeOf('Mezcal')).toBe('agave x');
      expect(await prisma.categoryType.findUnique({ where: { name: 'agave x' } }))
        .toEqual({ name: 'agave x', nameTranslations: null, color: 'gray' });
    });

    it.each([
      ['a blank new type', '   '],
      ['a new type of invisible characters', '\u200B\u2060'],
      ['a new type of blank characters', '\u2800'],
    ])('should refuse %s, pointing at its resolution, and write nothing', async (_case, type) => {
      const before = await rowCounts();
      const typeCount = await prisma.categoryType.count();

      await expect(importUnderTypes({ Mezcal: type })).rejects.toMatchObject({
        status: 400, details: [{ path: 'body.resolutions.categories.mezcal.data.type', code: 'too_small' }],
      });
      expect(await rowCounts()).toEqual(before);
      expect(await prisma.categoryType.count()).toBe(typeCount);
    });
  });

  it('should read resolution keys whatever their case', async () => {
    const unit = await seedUnit();
    const lime = await seedIngredient({ name: 'Lime' });

    const cocktail = await confirmImport(recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]), resolutions({
      units: { CL: { action: 'use_existing', existingId: unit.id } },
      ingredients: { LIME: { action: 'use_existing', existingId: lime.id } },
    }));

    expect(cocktail.ingredients[0]).toMatchObject({ unitId: unit.id, ingredientId: lime.id });
  });

  it('should not create an entity the recipe does not name', async () => {
    const unit = await seedUnit();

    await confirmImport(recipe([]), resolutions({
      units: { cl: { action: 'use_existing', existingId: unit.id } },
      ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
    }));

    expect(await prisma.ingredient.count()).toBe(0);
  });
});
