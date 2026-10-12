import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { BadRequestError } from '../../errors';
import { ImportRecipeV1, ImportResolutions } from '../../validation/cocktailImport';
import { SourceType } from '../../validation/cocktails';
import { createCocktailIn, IngredientLineValue } from './cocktailService';
import { collectImportReferences, ImportReferences, ImportedLine } from './importReferences';

/**
 * Import of a cocktail exported as JSON (format version 1).
 *
 * The preview matches each unit, category, bottle and ingredient the recipe names
 * with an existing row. The admin then picks, for each one, an existing row, a new
 * one or nothing (`skip`), and the confirmation writes everything in one transaction.
 */

type ImportedRecipe = z.output<typeof ImportRecipeV1>['cocktail'];
type Resolutions = z.output<typeof ImportResolutions>;
type Db = Prisma.TransactionClient;

type EntityKind = 'unit' | 'category' | 'bottle' | 'ingredient';

/**
 * Detail of an `errors.importUnresolved` 400: `line` is the index of the recipe line,
 * `name` the unit abbreviation or the source name of the file (null for a line without unit).
 */
export interface UnresolvedReference {
  line: number;
  kind: EntityKind;
  name: string | null;
}

/** Ids of the matched or created entities, keyed like the references (lowercased). */
interface ResolvedIds {
  unit: Map<string, number>;
  category: Map<string, number>;
  bottle: Map<string, number>;
  ingredient: Map<string, number>;
}

const SOURCE_KIND: Record<z.output<typeof SourceType>, EntityKind> = {
  BOTTLE: 'bottle',
  CATEGORY: 'category',
  INGREDIENT: 'ingredient',
};

function lowercase(value: string): string {
  return value.toLowerCase();
}

function stringifyTranslations(translations: Record<string, unknown> | null | undefined): string | null {
  return translations ? JSON.stringify(translations) : null;
}

// --- Preview ---------------------------------------------------------------

/** Cocktail names are not unique (C-07): a same name, whatever its case, is only reported. */
async function cocktailNameExists(name: string): Promise<boolean> {
  const cocktails = await prisma.cocktail.findMany({ select: { name: true } });
  return cocktails.some((cocktail) => lowercase(cocktail.name) === lowercase(name));
}

/** Pairs each reference with the row whose compared field (`keyOf`) matches it, ignoring case. */
function matchReferences<Ref, Row extends { id: number }>(
  refs: Map<string, Ref>,
  rows: Row[],
  keyOf: (row: Row) => string,
) {
  return Array.from(refs.entries()).map(([key, ref]) => {
    const match = rows.find((row) => lowercase(keyOf(row)) === key);
    return {
      ref,
      // `name` is the compared field: the abbreviation for a unit
      existingMatch: match ? { ...match, id: match.id, name: keyOf(match) } : null,
      status: match ? ('matched' as const) : ('missing' as const),
    };
  });
}

const byName = (row: { name: string }) => row.name;

export async function previewImport(recipe: ImportedRecipe) {
  const refs = collectImportReferences(recipe);
  return {
    cocktail: {
      name: recipe.name,
      description: recipe.description,
      tags: recipe.tags || [],
      alreadyExists: await cocktailNameExists(recipe.name),
    },
    units: matchReferences(refs.units, await prisma.unit.findMany(), (unit) => unit.abbreviation),
    categories: matchReferences(refs.categories, await prisma.category.findMany(), byName),
    bottles: matchReferences(refs.bottles, await prisma.bottle.findMany({ include: { category: true } }), byName),
    ingredients: matchReferences(refs.ingredients, await prisma.ingredient.findMany(), byName),
  };
}

// --- Entity resolution -----------------------------------------------------

interface Resolution<Data> {
  action: 'use_existing' | 'create' | 'skip';
  existingId?: number | null;
  data?: Data;
}

// The wizard keys resolutions by lowercased name, like the references; older clients may not
function byLowercaseKey<T>(resolutions: Record<string, T> | undefined): Map<string, T> {
  return new Map(Object.entries(resolutions ?? {}).map(([key, value]) => [lowercase(key), value]));
}

/**
 * Applies the admin's choice to every entity the recipe refers to and returns the ids
 * found or created. A skipped entity, or one without a usable choice, is left out:
 * the recipe lines that need it are refused or fall back later (`toRecipeLine`).
 */
async function resolveEntities<Ref, Data>(
  refs: Map<string, Ref>,
  resolutions: Record<string, Resolution<Data>> | undefined,
  create: (data: Data, ref: Ref, key: string) => Promise<number>,
): Promise<Map<string, number>> {
  const choices = byLowercaseKey(resolutions);
  const ids = new Map<string, number>();
  for (const [key, ref] of refs) {
    const choice = choices.get(key);
    if (choice?.action === 'use_existing' && choice.existingId) {
      ids.set(key, choice.existingId);
    } else if (choice?.action === 'create' && choice.data) {
      ids.set(key, await create(choice.data, ref, key));
    }
  }
  return ids;
}

function unresolved(details: UnresolvedReference[]): BadRequestError {
  return new BadRequestError('errors.importUnresolved', details);
}

// The first recipe line that names this bottle, as its source or as a preferred bottle
function firstLineUsingBottle(recipe: ImportedRecipe, key: string): number {
  return (recipe.ingredients ?? []).findIndex((line) =>
    (line.sourceType === 'BOTTLE' && lowercase(line.sourceName) === key)
    || (line.preferredBottles ?? []).some((bottle) => lowercase(bottle.name) === key));
}

async function ensureCategoryType(db: Db, name: string): Promise<void> {
  const existing = await db.categoryType.findUnique({ where: { name } });
  if (!existing) await db.categoryType.create({ data: { name, color: 'gray' } });
}

// A name the admin cleared in the wizard falls back on the one in the file
async function resolveAll(db: Db, recipe: ImportedRecipe, refs: ImportReferences, resolutions: Resolutions | undefined) {
  const unit = await resolveEntities(refs.units, resolutions?.units, async (data, ref, key) => {
    const abbreviation = data.abbreviation || ref.abbreviation || key;
    const created = await db.unit.create({
      data: {
        // A hand-made file may give no unit name: the abbreviation names it then
        name: data.name || ref.name || abbreviation,
        abbreviation,
        conversionFactorToMl: data.conversionFactorToMl ?? null,
        nameTranslations: stringifyTranslations(data.nameTranslations),
      },
    });
    return created.id;
  });

  const category = await resolveEntities(refs.categories, resolutions?.categories, async (data, ref, key) => {
    // The schema defaults the type to SPIRIT
    await ensureCategoryType(db, data.type);
    const created = await db.category.create({
      data: {
        name: data.name || ref.name || key,
        type: data.type,
        desiredStock: data.desiredStock,
        minimumPercent: data.minimumPercent,
        nameTranslations: stringifyTranslations(data.nameTranslations),
      },
    });
    return created.id;
  });

  const bottle = await resolveEntities(refs.bottles, resolutions?.bottles, async (data, ref, key) => {
    const name = data.name || ref.name || key;
    const categoryName = data.categoryName || ref.categoryName;
    const categoryId = categoryName ? category.get(lowercase(categoryName)) : undefined;
    if (!categoryId) throw unresolved([{ line: firstLineUsingBottle(recipe, key), kind: 'bottle', name }]);
    const { capacityMl, remainingPercent, alcoholPercentage } = data;
    const created = await db.bottle.create({ data: { name, categoryId, capacityMl, remainingPercent, alcoholPercentage } });
    return created.id;
  });

  const ingredient = await resolveEntities(refs.ingredients, resolutions?.ingredients, async (data, ref, key) => {
    const created = await db.ingredient.create({
      data: {
        name: data.name || ref.name || key,
        icon: data.icon ?? null,
        nameTranslations: stringifyTranslations(data.nameTranslations),
      },
    });
    return created.id;
  });

  return { unit, category, bottle, ingredient };
}

// --- Recipe lines ----------------------------------------------------------

type LineSource = Pick<IngredientLineValue, 'sourceType' | 'bottleId' | 'categoryId' | 'ingredientId'>;

/**
 * The source of an imported line. A skipped bottle falls back on its category
 * (any bottle of the category will do) when the category is resolved.
 */
function resolveSource(line: ImportedLine, ids: ResolvedIds): LineSource | null {
  const id = ids[SOURCE_KIND[line.sourceType]].get(lowercase(line.sourceName));
  if (id && line.sourceType === 'BOTTLE') return { sourceType: 'BOTTLE', bottleId: id };
  if (id && line.sourceType === 'CATEGORY') return { sourceType: 'CATEGORY', categoryId: id };
  if (id && line.sourceType === 'INGREDIENT') return { sourceType: 'INGREDIENT', ingredientId: id };

  const categoryName = line.sourceType === 'BOTTLE' ? line.sourceDetail?.categoryName : undefined;
  const categoryId = categoryName ? ids.category.get(lowercase(categoryName)) : undefined;
  return categoryId ? { sourceType: 'CATEGORY', categoryId } : null;
}

// Preferred bottles only mean something on a CATEGORY line; a skipped one is dropped
function preferredBottleIds(line: ImportedLine, source: LineSource, ids: ResolvedIds): number[] | undefined {
  if (source.sourceType !== 'CATEGORY') return undefined;
  return (line.preferredBottles ?? [])
    .map((bottle) => ids.bottle.get(lowercase(bottle.name)))
    .filter((id): id is number => id !== undefined);
}

/** Lists what the line misses: its unit, its source, or both. */
function missingReferences(line: ImportedLine, index: number, unitId: number | undefined, source: LineSource | null) {
  const missing: UnresolvedReference[] = [];
  if (!unitId) missing.push({ line: index, kind: 'unit', name: line.unit?.abbreviation ?? null });
  if (!source) missing.push({ line: index, kind: SOURCE_KIND[line.sourceType], name: line.sourceName });
  return missing;
}

/**
 * Builds the recipe lines from the resolved ids. Every line must end with a unit and
 * the key of its source type: otherwise nothing is written and the 400 lists them all.
 */
function toRecipeLines(lines: ImportedLine[], ids: ResolvedIds): IngredientLineValue[] {
  const missing: UnresolvedReference[] = [];
  const recipeLines: IngredientLineValue[] = [];
  lines.forEach((line, index) => {
    const unitId = line.unit ? ids.unit.get(lowercase(line.unit.abbreviation)) : undefined;
    const source = resolveSource(line, ids);
    missing.push(...missingReferences(line, index, unitId, source));
    if (unitId && source) {
      recipeLines.push({ ...source, quantity: line.quantity, unitId, preferredBottleIds: preferredBottleIds(line, source, ids) });
    }
  });
  if (missing.length > 0) throw unresolved(missing);
  return recipeLines;
}

// --- Confirmation ----------------------------------------------------------

/** Creates the entities the admin asked for, then the cocktail, in one transaction. */
export async function confirmImport(recipe: ImportedRecipe, resolutions: Resolutions | undefined) {
  const refs = collectImportReferences(recipe);
  return prisma.$transaction(async (tx) => {
    const ids = await resolveAll(tx, recipe, refs, resolutions);
    return createCocktailIn(tx, {
      name: recipe.name,
      description: recipe.description,
      notes: recipe.notes,
      tags: recipe.tags,
      isAvailable: true,
      ingredients: toRecipeLines(recipe.ingredients ?? [], ids),
      instructions: (recipe.instructions ?? []).map((step) => step.text),
    });
  });
}
