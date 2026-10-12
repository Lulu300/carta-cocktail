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
        bottles: { havana: { action: 'create', data: { name: 'Havana', categoryName: 'Rum', capacityMl: 700 } } },
      })),
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
