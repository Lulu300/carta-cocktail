import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { BadRequestError, NotFoundError } from '../../errors';
import { CocktailCreate, CocktailUpdate, IngredientLine, Tags } from '../../validation/cocktails';
import { refuseNewRecipeDefects } from '../recipeDefectsService';
import { removeImageFile } from './cocktailImage';
import { cocktailInclude } from './includes';

type Db = Prisma.TransactionClient;
type CocktailInput = z.output<typeof CocktailCreate>;
type CocktailChanges = z.output<typeof CocktailUpdate>;

/** A recipe line once validated: by the create or update schema, or built by the import. */
export type IngredientLineValue = z.output<typeof IngredientLine>;

type ReferenceField = 'unitId' | 'bottleId' | 'categoryId' | 'ingredientId' | 'preferredBottleIds';
type ReferencedTable = 'units' | 'bottles' | 'categories' | 'ingredients';

const TABLE_OF_FIELD: Record<ReferenceField, ReferencedTable> = {
  unitId: 'units',
  bottleId: 'bottles',
  categoryId: 'categories',
  ingredientId: 'ingredients',
  preferredBottleIds: 'bottles',
};

const REFERENCE_FIELDS = Object.keys(TABLE_OF_FIELD) as ReferenceField[];

/** Detail of an `errors.unknownReference` 400: `line` is the index of the line in the request. */
export interface UnknownReference {
  line: number;
  field: ReferenceField;
  id: number;
}

/** Maps a validated ingredient line to a nested Prisma create. The array index gives the position. */
export function toIngredientCreate(line: IngredientLineValue, index: number) {
  return {
    quantity: line.quantity,
    unitId: line.unitId,
    sourceType: line.sourceType,
    bottleId: line.bottleId ?? null,
    categoryId: line.categoryId ?? null,
    ingredientId: line.ingredientId ?? null,
    position: index,
    preferredBottles: line.preferredBottleIds
      ? { create: line.preferredBottleIds.map((bottleId) => ({ bottleId })) }
      : undefined,
  };
}

function toInstructionCreate(text: string, index: number) {
  return { stepNumber: index + 1, text };
}

// Tags are stored as a comma-separated string
function toTagsString(tags: z.output<typeof Tags> | undefined): string {
  return Array.isArray(tags) ? tags.join(',') : (tags ?? '');
}

function idsOf(line: IngredientLineValue, field: ReferenceField): number[] {
  const value = line[field];
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

async function loadExistingIds(db: Db, lines: IngredientLineValue[]): Promise<Record<ReferencedTable, Set<number>>> {
  const wanted = (table: ReferencedTable) => REFERENCE_FIELDS
    .filter((field) => TABLE_OF_FIELD[field] === table)
    .flatMap((field) => lines.flatMap((line) => idsOf(line, field)));
  const where = (table: ReferencedTable) => ({ where: { id: { in: wanted(table) } }, select: { id: true } });
  const toSet = (rows: { id: number }[]) => new Set(rows.map((row) => row.id));
  return {
    units: toSet(await db.unit.findMany(where('units'))),
    bottles: toSet(await db.bottle.findMany(where('bottles'))),
    categories: toSet(await db.category.findMany(where('categories'))),
    ingredients: toSet(await db.ingredient.findMany(where('ingredients'))),
  };
}

function unknownReferencesOf(
  line: IngredientLineValue,
  index: number,
  existing: Record<ReferencedTable, Set<number>>,
): UnknownReference[] {
  const unknown: UnknownReference[] = [];
  for (const field of REFERENCE_FIELDS) {
    for (const id of idsOf(line, field)) {
      if (!existing[TABLE_OF_FIELD[field]].has(id)) unknown.push({ line: index, field, id });
    }
  }
  return unknown;
}

/**
 * Throws a 400 listing every id of the lines that names no row. Without it, the
 * foreign key fails and the admin gets a bare "Validation error" with no line.
 * A NULL source key is not checked here: `refuseNewRecipeDefects` deals with it.
 */
export async function assertTargetsExist(db: Db, lines: IngredientLineValue[]): Promise<void> {
  if (lines.length === 0) return;
  const existing = await loadExistingIds(db, lines);
  const unknown = lines.flatMap((line, index) => unknownReferencesOf(line, index, existing));
  if (unknown.length > 0) throw new BadRequestError('errors.unknownReference', unknown);
}

/** Creates a cocktail inside the caller's transaction (the import creates its entities first). */
export async function createCocktailIn(db: Db, input: CocktailInput) {
  const ingredients = input.ingredients ?? [];
  await assertTargetsExist(db, ingredients);
  return db.cocktail.create({
    data: {
      name: input.name,
      description: input.description || null,
      notes: input.notes || null,
      tags: toTagsString(input.tags),
      isAvailable: input.isAvailable ?? true,
      ingredients: { create: ingredients.map(toIngredientCreate) },
      instructions: { create: (input.instructions ?? []).map(toInstructionCreate) },
    },
    include: cocktailInclude,
  });
}

export async function createCocktail(input: CocktailInput) {
  return prisma.$transaction((tx) => createCocktailIn(tx, input));
}

/**
 * Writes only the fields present in `changes`, so a partial update such as
 * { isAvailable: false } keeps the recipe. Ingredients and instructions are
 * replaced only when their array is sent, in one transaction: if any part fails,
 * the stored recipe is left untouched. A line may keep a defect the stored recipe
 * already has (deleted source, quantity 0), but not add a new one.
 */
export async function updateCocktail(id: number, changes: CocktailChanges) {
  const { name, description, notes, tags, isAvailable, ingredients, instructions } = changes;
  // Reads with the shared client: it must run before the transaction opens
  if (ingredients) await refuseNewRecipeDefects(id, ingredients);

  return prisma.$transaction(async (tx) => {
    // A missing cocktail answers 404, even when the lines also name missing rows
    const cocktail = await tx.cocktail.findUnique({ where: { id }, select: { id: true } });
    if (!cocktail) throw new NotFoundError();
    if (ingredients) await assertTargetsExist(tx, ingredients);
    // Absent fields are undefined, which Prisma leaves untouched
    return tx.cocktail.update({
      where: { id },
      data: {
        name,
        description,
        notes,
        tags: tags === undefined ? undefined : toTagsString(tags),
        isAvailable,
        ...(ingredients && {
          ingredients: { deleteMany: {}, create: ingredients.map(toIngredientCreate) },
        }),
        ...(instructions && {
          instructions: { deleteMany: {}, create: instructions.map(toInstructionCreate) },
        }),
      },
      include: cocktailInclude,
    });
  });
}

/**
 * Deletes a cocktail, then its photo. The row goes first: if the deletion fails,
 * the cocktail keeps its photo. A missing cocktail ends in a 404 (Prisma P2025).
 */
export async function removeCocktail(id: number): Promise<void> {
  const { imagePath } = await prisma.cocktail.delete({ where: { id }, select: { imagePath: true } });
  if (imagePath) await removeImageFile(imagePath);
}
