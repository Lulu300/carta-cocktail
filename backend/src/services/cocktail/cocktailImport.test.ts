import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  prisma,
  seedUnit,
  seedCategory,
  seedBottle,
  seedIngredient,
  seedCocktail,
} from '../../test/helpers';
import { ImportRecipeV1, ImportResolutions } from '../../validation/cocktailImport';
import { confirmImport, previewImport } from './cocktailImport';

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

const CL = { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 };

// Parsed like the routes do, so schema defaults apply
function recipe(ingredients: unknown[], name = 'Imported') {
  return ImportRecipeV1.parse({
    version: 1,
    cocktail: { name, ingredients, instructions: [{ text: 'Shake' }] },
  }).cocktail;
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
  await expect(promise).rejects.toMatchObject({
    status: 400,
    i18nKey: 'errors.importUnresolved',
    details,
  });
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

    const preview = await previewImport(
      recipe([
        { sourceType: 'CATEGORY', sourceName: 'rum', quantity: 4, unit: { abbreviation: 'cl' } },
      ]),
    );
    expect(preview.units[0]).toMatchObject({
      status: 'matched',
      existingMatch: { id: unit.id, name: 'CL' },
    });
    expect(preview.categories[0]).toMatchObject({
      status: 'matched',
      existingMatch: { id: category.id, name: 'Rum' },
    });
  });

  it('should send the translations of an existing match as an object', async () => {
    await seedCategory({ name: 'Rum', nameTranslations: JSON.stringify({ fr: 'Rhum' }) });

    const preview = await previewImport(
      recipe([
        { sourceType: 'CATEGORY', sourceName: 'rum', quantity: 4, unit: { abbreviation: 'cl' } },
      ]),
    );
    expect(preview.categories[0].existingMatch).toMatchObject({
      name: 'Rum',
      nameTranslations: { fr: 'Rhum' },
    });
  });

  it('should not list the preferred bottles of a line that is not a category line', async () => {
    const preview = await previewImport(
      recipe([{ ...rumBottleLine, preferredBottles: [{ name: 'Diplomatico' }] }]),
    );
    expect(preview.bottles.map((entity) => entity.ref.name)).toEqual(['Havana']);
  });

  it('should keep the refs of every kind of entity', async () => {
    const preview = await previewImport(
      recipe([
        rumBottleLine,
        {
          sourceType: 'INGREDIENT',
          sourceName: 'Mint',
          sourceDetail: { icon: '🌿' },
          quantity: 1,
          unit: CL,
        },
        {
          sourceType: 'CATEGORY',
          sourceName: 'Gin',
          quantity: 2,
          unit: CL,
          preferredBottles: [{ name: 'Tanqueray', categoryName: 'Gin' }],
        },
      ]),
    );
    expect(preview.units).toEqual([
      { ref: { ...CL, nameTranslations: null }, existingMatch: null, status: 'missing' },
    ]);
    expect(preview.bottles.map((entity) => entity.ref)).toEqual([
      { name: 'Havana', categoryName: 'Rum', categoryType: 'SPIRIT' },
      { name: 'Tanqueray', categoryName: 'Gin', categoryType: 'SPIRIT' },
    ]);
    expect(preview.categories.map((entity) => entity.ref)).toEqual([
      { name: 'Rum', type: 'SPIRIT', desiredStock: 1, nameTranslations: null },
      { name: 'Gin', type: 'SPIRIT', desiredStock: 1, nameTranslations: null },
    ]);
    expect(preview.ingredients[0].ref).toEqual({
      name: 'Mint',
      icon: '🌿',
      nameTranslations: null,
    });
  });
});

describe('confirmImport - unresolved references', () => {
  it('should refuse a line whose unit is not resolved and create nothing', async () => {
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(
        recipe([{ ...rumBottleLine, sourceType: 'INGREDIENT', sourceName: 'Lime' }]),
        resolutions({
          ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
        }),
      ),
      [{ line: 0, kind: 'unit', name: 'cl' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should refuse a line without unit', async () => {
    const lime = await seedIngredient({ name: 'Lime' });

    await expectUnresolved(
      confirmImport(
        recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1 }]),
        resolutions({
          ingredients: { lime: { action: 'use_existing', existingId: lime.id } },
        }),
      ),
      [{ line: 0, kind: 'unit', name: null }],
    );
  });

  it('should fall back on the category of a skipped bottle', async () => {
    const unit = await seedUnit();
    const rum = await seedCategory({ name: 'Rum' });

    const cocktail = await confirmImport(
      recipe([rumBottleLine]),
      resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { rum: { action: 'use_existing', existingId: rum.id } },
        bottles: { havana: { action: 'skip' } },
      }),
    );
    expect(cocktail.ingredients).toMatchObject([
      {
        sourceType: 'CATEGORY',
        categoryId: rum.id,
        bottleId: null,
        ingredientId: null,
        unitId: unit.id,
      },
    ]);
  });

  it('should refuse a skipped bottle whose category is not resolved and write nothing', async () => {
    const unit = await seedUnit();
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(
        recipe([rumBottleLine]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          categories: { rum: { action: 'skip' } },
          bottles: { havana: { action: 'skip' } },
        }),
      ),
      [{ line: 0, kind: 'bottle', name: 'Havana' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should refuse a bottle to create without a resolved category', async () => {
    const unit = await seedUnit();
    const before = await rowCounts();

    await expectUnresolved(
      confirmImport(
        recipe([rumBottleLine]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          categories: { rum: { action: 'skip' } },
          bottles: {
            havana: {
              action: 'create',
              data: { name: 'Havana Club 3', categoryName: 'Rum', capacityMl: 700 },
            },
          },
        }),
      ),
      // Named as in the file, not as the admin renamed it
      [{ line: 0, kind: 'bottle', name: 'Havana' }],
    );
    expect(await rowCounts()).toEqual(before);
  });

  it('should give the line of a preferred bottle to create without category', async () => {
    const unit = await seedUnit();
    const gin = await seedCategory({ name: 'Gin' });

    await expectUnresolved(
      confirmImport(
        recipe([
          { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL },
          {
            sourceType: 'CATEGORY',
            sourceName: 'Gin',
            quantity: 1,
            unit: CL,
            preferredBottles: [{ name: 'Tanqueray' }],
          },
        ]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          categories: { gin: { action: 'use_existing', existingId: gin.id } },
          bottles: {
            tanqueray: { action: 'create', data: { name: 'Tanqueray', capacityMl: 700 } },
          },
        }),
      ),
      [{ line: 1, kind: 'bottle', name: 'Tanqueray' }],
    );
  });

  it('should list every unresolved line at once', async () => {
    await expectUnresolved(
      confirmImport(
        recipe([
          { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 2, unit: CL },
          { sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL },
        ]),
        resolutions({}),
      ),
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
      confirmImport(
        recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          ingredients: { lime: { action: 'use_existing' } },
        }),
      ),
      [{ line: 0, kind: 'ingredient', name: 'Lime' }],
    );
  });

  it('should answer unknownReference for an existing id that names no row', async () => {
    const unit = await seedUnit();

    await expect(
      confirmImport(
        recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          ingredients: { lime: { action: 'use_existing', existingId: 99999 } },
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      i18nKey: 'errors.unknownReference',
      details: [{ line: 0, field: 'ingredientId', id: 99999 }],
    });
    expect(await prisma.cocktail.count()).toBe(0);
  });
});

describe('confirmImport - recipe lines', () => {
  it('should write every line with its unit and the key of its source type', async () => {
    const cocktail = await confirmImport(
      recipe([
        rumBottleLine,
        { sourceType: 'CATEGORY', sourceName: 'Rum', quantity: 2, unit: CL },
        { sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL },
      ]),
      resolutions({
        units: { cl: { action: 'create', data: CL } },
        categories: { rum: { action: 'create', data: { name: 'Rum' } } },
        bottles: {
          havana: {
            action: 'create',
            data: { name: 'Havana', categoryName: 'Rum', capacityMl: 700 },
          },
        },
        ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
      }),
    );

    expect(cocktail.ingredients.map((line) => line.sourceType)).toEqual([
      'BOTTLE',
      'CATEGORY',
      'INGREDIENT',
    ]);
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
    const cocktail = await confirmImport(
      recipe([rumBottleLine]),
      resolutions({
        units: { cl: { action: 'create', data: CL } },
        categories: { rum: { action: 'create', data: { name: 'Rum' } } },
        bottles: {
          havana: { action: 'create', data: { name: 'Havana', categoryName: '', capacityMl: 700 } },
        },
      }),
    );

    const rum = await prisma.category.findUniqueOrThrow({ where: { name: 'Rum' } });
    expect(cocktail.ingredients[0].bottle).toMatchObject({ name: 'Havana', categoryId: rum.id });
  });

  it('should keep the resolved preferred bottles of a category line and drop the skipped ones', async () => {
    const unit = await seedUnit();
    const gin = await seedCategory({ name: 'Gin' });
    const tanqueray = await seedBottle({ name: 'Tanqueray', categoryId: gin.id });

    const cocktail = await confirmImport(
      recipe([
        {
          sourceType: 'CATEGORY',
          sourceName: 'Gin',
          quantity: 2,
          unit: CL,
          preferredBottles: [
            { name: 'Tanqueray', categoryName: 'Gin' },
            { name: 'Bombay', categoryName: 'Gin' },
          ],
        },
      ]),
      resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { gin: { action: 'use_existing', existingId: gin.id } },
        bottles: {
          tanqueray: { action: 'use_existing', existingId: tanqueray.id },
          bombay: { action: 'skip' },
        },
      }),
    );

    expect(cocktail.ingredients[0].preferredBottles.map((preferred) => preferred.bottleId)).toEqual(
      [tanqueray.id],
    );
  });

  it('should drop the preferred bottles of a line that is not a category line', async () => {
    const unit = await seedUnit();
    const rum = await seedCategory({ name: 'Rum' });
    const havana = await seedBottle({ name: 'Havana', categoryId: rum.id });
    const other = await seedBottle({ name: 'Diplomatico', categoryId: rum.id });

    const cocktail = await confirmImport(
      recipe([
        {
          ...rumBottleLine,
          preferredBottles: [{ name: 'Diplomatico', categoryName: 'Rum' }],
        },
      ]),
      resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        categories: { rum: { action: 'use_existing', existingId: rum.id } },
        bottles: {
          havana: { action: 'use_existing', existingId: havana.id },
          diplomatico: { action: 'use_existing', existingId: other.id },
        },
      }),
    );

    expect(cocktail.ingredients[0]).toMatchObject({
      sourceType: 'BOTTLE',
      bottleId: havana.id,
      preferredBottles: [],
    });
  });

  it('should collapse the inner spaces of a category type it creates', async () => {
    const cocktail = await confirmImport(
      recipe([{ sourceType: 'CATEGORY', sourceName: 'Mezcal', quantity: 2, unit: CL }]),
      resolutions({
        units: { cl: { action: 'create', data: CL } },
        categories: {
          mezcal: { action: 'create', data: { name: 'Mezcal', type: 'AGAVE   SPIRIT' } },
        },
      }),
    );

    expect(cocktail.ingredients[0].category).toMatchObject({
      name: 'Mezcal',
      type: 'AGAVE SPIRIT',
    });
    expect(await prisma.categoryType.findUnique({ where: { name: 'AGAVE   SPIRIT' } })).toBeNull();
  });

  // Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT': the wizard lists both, and the
  // category goes under the one picked, as when it is created by hand (C-57)
  describe('type picked for a category to create', () => {
    /** Imports one category line per category, each category created under the type given. */
    function importUnderTypes(typesByCategory: Record<string, string>) {
      const names = Object.keys(typesByCategory);
      const lines = names.map((name) => ({
        sourceType: 'CATEGORY',
        sourceName: name,
        quantity: 2,
        unit: CL,
      }));
      const categories = Object.fromEntries(
        names.map((name) => [
          name.toLowerCase(),
          { action: 'create', data: { name, type: typesByCategory[name] } },
        ]),
      );
      return confirmImport(
        recipe(lines),
        resolutions({ units: { cl: { action: 'create', data: CL } }, categories }),
      );
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
      expect(await prisma.categoryType.findUnique({ where: { name: 'agave x' } })).toEqual({
        name: 'agave x',
        nameTranslations: null,
        color: 'gray',
      });
    });

    it.each([
      ['a blank new type', '   '],
      ['a new type of invisible characters', '\u200B\u2060'],
      ['a new type of blank characters', '\u2800'],
    ])('should refuse %s, pointing at its resolution, and write nothing', async (_case, type) => {
      const before = await rowCounts();
      const typeCount = await prisma.categoryType.count();

      await expect(importUnderTypes({ Mezcal: type })).rejects.toMatchObject({
        status: 400,
        details: [{ path: 'body.resolutions.categories.mezcal.data.type', code: 'too_small' }],
      });
      expect(await rowCounts()).toEqual(before);
      expect(await prisma.categoryType.count()).toBe(typeCount);
    });
  });

  it('should read resolution keys whatever their case', async () => {
    const unit = await seedUnit();
    const lime = await seedIngredient({ name: 'Lime' });

    const cocktail = await confirmImport(
      recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]),
      resolutions({
        units: { CL: { action: 'use_existing', existingId: unit.id } },
        ingredients: { LIME: { action: 'use_existing', existingId: lime.id } },
      }),
    );

    expect(cocktail.ingredients[0]).toMatchObject({ unitId: unit.id, ingredientId: lime.id });
  });

  it('should not create an entity the recipe does not name', async () => {
    const unit = await seedUnit();

    await confirmImport(
      recipe([]),
      resolutions({
        units: { cl: { action: 'use_existing', existingId: unit.id } },
        ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
      }),
    );

    expect(await prisma.ingredient.count()).toBe(0);
  });
});

// The routes refuse a second category or unit that differs only by case (C-07): an import uses the
// existing one instead of creating it (C-19). Older data may still hold 'Rum' next to 'RUM'.
describe('units and categories that exist ignoring case', () => {
  const rumLine = { sourceType: 'CATEGORY', sourceName: 'rum', quantity: 4, unit: CL };

  describe('previewImport', () => {
    it('should match the exact row before the others equal ignoring case', async () => {
      await seedCategory({ name: 'Rum' });
      const rum = await seedCategory({ name: 'rum' });
      await seedUnit({ abbreviation: 'CL' });
      const cl = await seedUnit({ abbreviation: 'cl' });

      const preview = await previewImport(recipe([rumLine]));

      expect(preview.categories[0]).toMatchObject({
        status: 'matched',
        existingMatch: { id: rum.id, name: 'rum' },
      });
      expect(preview.units[0]).toMatchObject({
        status: 'matched',
        existingMatch: { id: cl.id, name: 'cl' },
      });
    });

    it('should list the rows a name could mean when several are equal ignoring case and none exactly', async () => {
      const rum = await seedCategory({
        name: 'Rum',
        nameTranslations: JSON.stringify({ fr: 'Rhum' }),
      });
      const upperRum = await seedCategory({ name: 'RUM' });
      const upperCl = await seedUnit({ abbreviation: 'CL' });
      const titleCl = await seedUnit({ abbreviation: 'Cl' });

      const preview = await previewImport(recipe([rumLine]));

      expect(preview.categories[0]).toMatchObject({
        status: 'ambiguous',
        existingMatch: null,
        ambiguousMatches: [
          { id: rum.id, name: 'Rum', nameTranslations: { fr: 'Rhum' } },
          { id: upperRum.id, name: 'RUM' },
        ],
      });
      expect(preview.units[0]).toMatchObject({
        status: 'ambiguous',
        existingMatch: null,
        ambiguousMatches: [
          { id: upperCl.id, name: 'CL' },
          { id: titleCl.id, name: 'Cl' },
        ],
      });
    });

    // Bottles and ingredients need not be unique ignoring case: the exact row first, else the first one
    it('should propose the exact bottle or ingredient first, else the first one equal ignoring case', async () => {
      const rum = await seedCategory({ name: 'Rum' });
      const havana = await seedBottle({ name: 'Havana', categoryId: rum.id });
      const lowerHavana = await seedBottle({ name: 'havana', categoryId: rum.id });
      const lime = await seedIngredient({ name: 'Lime' });
      const lowerLime = await seedIngredient({ name: 'lime' });

      const preview = await previewImport(
        recipe([
          { ...rumBottleLine, sourceName: 'havana' },
          { sourceType: 'INGREDIENT', sourceName: 'lime', quantity: 1, unit: CL },
        ]),
      );

      expect(preview.bottles).toEqual([
        expect.objectContaining({
          status: 'matched',
          existingMatch: expect.objectContaining({ id: lowerHavana.id }),
        }),
      ]);
      expect(preview.ingredients).toEqual([
        expect.objectContaining({
          status: 'matched',
          existingMatch: expect.objectContaining({ id: lowerLime.id }),
        }),
      ]);

      const upperPreview = await previewImport(
        recipe([
          { ...rumBottleLine, sourceName: 'HAVANA' },
          { sourceType: 'INGREDIENT', sourceName: 'LIME', quantity: 1, unit: CL },
        ]),
      );
      expect(upperPreview.bottles[0]).toMatchObject({
        status: 'matched',
        existingMatch: { id: havana.id },
      });
      expect(upperPreview.ingredients[0]).toMatchObject({
        status: 'matched',
        existingMatch: { id: lime.id },
      });
    });
  });

  describe('confirmImport', () => {
    it.each([
      ['in another case', 'rum'],
      ['exactly', 'Rum'],
      ['under the name the admin typed', 'RUM'],
    ])(
      'should use a category that exists %s instead of creating it, with its own type',
      async (_case, name) => {
        const rum = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
        const unit = await seedUnit();
        const typeCount = await prisma.categoryType.count();

        const cocktail = await confirmImport(
          recipe([rumLine]),
          resolutions({
            units: { cl: { action: 'use_existing', existingId: unit.id } },
            categories: { rum: { action: 'create', data: { name, type: 'NEW TYPE' } } },
          }),
        );

        expect(cocktail.ingredients[0]).toMatchObject({
          sourceType: 'CATEGORY',
          categoryId: rum.id,
        });
        expect(await prisma.category.count()).toBe(1);
        expect(await prisma.category.findUniqueOrThrow({ where: { id: rum.id } })).toMatchObject({
          name: 'Rum',
          type: 'SPIRIT',
        });
        expect(await prisma.categoryType.count()).toBe(typeCount);
      },
    );

    it('should use a unit whose abbreviation exists in another case instead of creating it', async () => {
      const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'CL' });

      const cocktail = await confirmImport(
        recipe([{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit: CL }]),
        resolutions({
          units: { cl: { action: 'create', data: CL } },
          ingredients: { lime: { action: 'create', data: { name: 'Lime' } } },
        }),
      );

      expect(cocktail.ingredients[0]).toMatchObject({ unitId: unit.id });
      expect(await prisma.unit.findMany({ select: { abbreviation: true } })).toEqual([
        { abbreviation: 'CL' },
      ]);
    });

    it('should create a category once when two references create it under names equal ignoring case', async () => {
      const cocktail = await confirmImport(
        recipe([
          { sourceType: 'CATEGORY', sourceName: 'Mezcal', quantity: 2, unit: CL },
          { sourceType: 'CATEGORY', sourceName: 'Agave', quantity: 1, unit: CL },
        ]),
        resolutions({
          units: { cl: { action: 'create', data: CL } },
          categories: {
            mezcal: { action: 'create', data: { name: 'Mezcal' } },
            agave: { action: 'create', data: { name: 'MEZCAL' } },
          },
        }),
      );

      const mezcal = await prisma.category.findUniqueOrThrow({ where: { name: 'Mezcal' } });
      expect(cocktail.ingredients.map((line) => line.categoryId)).toEqual([mezcal.id, mezcal.id]);
      expect(await prisma.category.count()).toBe(1);
    });

    it.each([
      [
        'category',
        'errors.ambiguousCategoryName',
        { categories: { rum: { action: 'create', data: { name: 'rum' } } } },
        'rum',
        'Rum, RUM',
      ],
      [
        'unit',
        'errors.ambiguousUnitAbbreviation',
        { units: { cl: { action: 'create', data: CL } } },
        'cl',
        'CL, Cl',
      ],
    ])(
      'should refuse a %s to create that several rows hold ignoring case, naming them, and write nothing',
      async (_kind, i18nKey, chosen, name, matches) => {
        await seedCategory({ name: 'Rum' });
        await seedCategory({ name: 'RUM' });
        await seedUnit({ abbreviation: 'CL' });
        await seedUnit({ abbreviation: 'Cl' });
        const before = await rowCounts();

        await expect(confirmImport(recipe([rumLine]), resolutions(chosen))).rejects.toMatchObject({
          status: 409,
          i18nKey,
          details: { name, matches },
        });
        expect(await rowCounts()).toEqual(before);
      },
    );

    it.each([
      ['a blank', '   '],
      ['an invisible', '\u200B'],
    ])(
      'should refuse %s new type even when the category exists ignoring case, and write nothing',
      async (_case, type) => {
        await seedCategory({ name: 'Rum' });
        const unit = await seedUnit();
        const before = await rowCounts();
        const typeCount = await prisma.categoryType.count();

        await expect(
          confirmImport(
            recipe([rumLine]),
            resolutions({
              units: { cl: { action: 'use_existing', existingId: unit.id } },
              categories: { rum: { action: 'create', data: { name: 'rum', type } } },
            }),
          ),
        ).rejects.toMatchObject({
          status: 400,
          details: [{ path: 'body.resolutions.categories.rum.data.type' }],
        });
        expect(await rowCounts()).toEqual(before);
        expect(await prisma.categoryType.count()).toBe(typeCount);
      },
    );

    it('should put a category to create under the exact row when others are equal to it ignoring case', async () => {
      await seedCategory({ name: 'Rum' });
      const lowerRum = await seedCategory({ name: 'rum' });
      const unit = await seedUnit();

      const cocktail = await confirmImport(
        recipe([rumLine]),
        resolutions({
          units: { cl: { action: 'use_existing', existingId: unit.id } },
          categories: { rum: { action: 'create', data: { name: 'rum' } } },
        }),
      );

      expect(cocktail.ingredients[0]).toMatchObject({ categoryId: lowerRum.id });
      expect(await prisma.category.count()).toBe(2);
    });
  });
});

// A name pasted from a macOS file name can hold decomposed accents: 'Cre\u0300me' looks like 'Cr\u00E8me' (C-65)
describe('names in another Unicode form', () => {
  const PEEL = { name: 'E\u0301corce', abbreviation: 'e\u0301corce', conversionFactorToMl: null };
  const creamLine = { sourceType: 'CATEGORY', sourceName: 'Cre\u0300me', quantity: 2, unit: PEEL };

  it('should match a category and a unit stored in the composed form', async () => {
    const cream = await seedCategory({ name: 'Cr\u00E8me' });
    const peel = await seedUnit({ name: '\u00C9corce', abbreviation: '\u00C9CORCE' });

    const preview = await previewImport(recipe([creamLine]));

    expect(preview.categories[0]).toMatchObject({
      status: 'matched',
      existingMatch: { id: cream.id },
    });
    expect(preview.units[0]).toMatchObject({ status: 'matched', existingMatch: { id: peel.id } });
  });

  it('should use the composed category and unit instead of creating their decomposed form', async () => {
    const cream = await seedCategory({ name: 'Cr\u00E8me' });
    const peel = await seedUnit({ name: '\u00C9corce', abbreviation: '\u00E9corce' });

    const cocktail = await confirmImport(
      recipe([creamLine]),
      resolutions({
        units: { 'e\u0301corce': { action: 'create', data: PEEL } },
        categories: { 'cre\u0300me': { action: 'create', data: { name: 'Cre\u0300me' } } },
      }),
    );

    expect(cocktail.ingredients[0]).toMatchObject({ categoryId: cream.id, unitId: peel.id });
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.unit.count()).toBe(1);
  });

  it('should store a category, unit and ingredient it creates composed, translations included', async () => {
    const translations = { nameTranslations: { fr: 'Cre\u0300me' } };

    await confirmImport(
      recipe([
        creamLine,
        { sourceType: 'INGREDIENT', sourceName: 'Cre\u0300me', quantity: 1, unit: PEEL },
      ]),
      resolutions({
        units: { 'e\u0301corce': { action: 'create', data: { ...PEEL, ...translations } } },
        categories: {
          'cre\u0300me': { action: 'create', data: { name: 'Cre\u0300me', ...translations } },
        },
        ingredients: {
          'cre\u0300me': { action: 'create', data: { name: 'Cre\u0300me', ...translations } },
        },
      }),
    );

    const composed = { nameTranslations: JSON.stringify({ fr: 'Cr\u00E8me' }) };
    expect(await prisma.unit.findMany()).toEqual([
      expect.objectContaining({ name: '\u00C9corce', abbreviation: '\u00E9corce', ...composed }),
    ]);
    expect(await prisma.category.findMany()).toEqual([
      expect.objectContaining({ name: 'Cr\u00E8me', ...composed }),
    ]);
    expect(await prisma.ingredient.findMany()).toEqual([
      expect.objectContaining({ name: 'Cr\u00E8me', ...composed }),
    ]);
  });
});

// Ingredient names are unique as stored: one stored name is one ingredient, used as it is (C-65)
describe('ingredients to create that an ingredient already holds', () => {
  const COMPOSED = 'Cr\u00E8me';
  const DECOMPOSED = 'Cre\u0300me';
  const ingredientLine = (sourceName: string) => ({
    sourceType: 'INGREDIENT',
    sourceName,
    quantity: 1,
    unit: CL,
  });
  const createIngredient = (name: string) => ({ action: 'create', data: { name } });

  async function importIngredients(names: string[]) {
    return confirmImport(
      recipe(names.map(ingredientLine)),
      resolutions({
        units: { cl: { action: 'create', data: CL } },
        ingredients: Object.fromEntries(
          names.map((name) => [name.toLowerCase(), createIngredient(name)]),
        ),
      }),
    );
  }

  it('should create one ingredient for two lines naming it in each Unicode form', async () => {
    const cocktail = await importIngredients([COMPOSED, DECOMPOSED]);

    const [cream] = await prisma.ingredient.findMany();
    expect(cream.name).toBe(COMPOSED);
    expect(cocktail.ingredients.map((line) => line.ingredientId)).toEqual([cream.id, cream.id]);
    expect(await prisma.ingredient.count()).toBe(1);
  });

  it.each([
    ['in the other Unicode form', COMPOSED, DECOMPOSED],
    ['decomposed, under its composed form', DECOMPOSED, COMPOSED],
    ['under its exact name', COMPOSED, COMPOSED],
  ])(
    'should use an existing ingredient named %s instead of creating it',
    async (_case, stored, typed) => {
      const cream = await seedIngredient({ name: stored });

      const cocktail = await importIngredients([typed]);

      expect(cocktail.ingredients[0]).toMatchObject({ ingredientId: cream.id });
      expect(await prisma.ingredient.findMany({ select: { name: true } })).toEqual([
        { name: stored },
      ]);
    },
  );

  it('should use the ingredient stored under the composed name when both forms exist', async () => {
    await seedIngredient({ name: DECOMPOSED });
    const composed = await seedIngredient({ name: COMPOSED });

    const cocktail = await importIngredients([DECOMPOSED]);

    expect(cocktail.ingredients[0]).toMatchObject({ ingredientId: composed.id });
    expect(await prisma.ingredient.count()).toBe(2);
  });

  it('should still create an ingredient whose name differs by case', async () => {
    await seedIngredient({ name: 'Lime' });

    await importIngredients(['lime']);

    expect(
      await prisma.ingredient.findMany({ select: { name: true }, orderBy: { id: 'asc' } }),
    ).toEqual([{ name: 'Lime' }, { name: 'lime' }]);
  });
});
