import type { CocktailIngredient } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { BadRequestError } from '../errors';
import {
  IngredientLine, IngredientLineUpdate, missingSourceKeyMessage, SOURCE_KEYS, SourceKey, SourceType,
} from '../validation/cocktails';
import { toValidationIssue, ValidationIssue } from '../validation/validate';

/**
 * Recipe defects kept when a cocktail is updated.
 *
 * Until v1.7.0, deleting a bottle, category or ingredient set the key of the recipe
 * lines using it to NULL, and the form saved a cleared quantity as 0. Such lines are
 * still stored and the form sends them back unchanged, so refusing them would block
 * any update of the cocktail, even a rename. An update may therefore keep the defects
 * the cocktail already has, but not add new ones.
 *
 * The request lines have no id (an update replaces them all): defects are counted.
 * For each kind of defect, the request may hold as many as the stored recipe.
 */

type RequestLine = z.output<typeof IngredientLineUpdate>;
type StoredLine = Pick<CocktailIngredient, 'sourceType' | 'bottleId' | 'categoryId' | 'ingredientId' | 'quantity'>;

/** A missing source key (one kind per source type) or a quantity of 0. */
type Defect = SourceKey | 'quantity';

function missingSourceKey(line: RequestLine | StoredLine): SourceKey | null {
  // Stored lines hold a plain string: an unknown source type has no key to miss
  const sourceType = SourceType.safeParse(line.sourceType);
  if (!sourceType.success) return null;
  const key = SOURCE_KEYS[sourceType.data];
  return line[key] == null ? key : null;
}

function defectsOf(line: RequestLine | StoredLine): Defect[] {
  const defects: Defect[] = [];
  const missingKey = missingSourceKey(line);
  if (missingKey) defects.push(missingKey);
  if (line.quantity === 0) defects.push('quantity');
  return defects;
}

function countDefects(lines: StoredLine[]): Map<Defect, number> {
  const counts = new Map<Defect, number>();
  for (const defect of lines.flatMap(defectsOf)) {
    counts.set(defect, (counts.get(defect) ?? 0) + 1);
  }
  return counts;
}

// Used only if the strict schema stops reporting a defect under its own key: the
// defect is still refused (fail closed) rather than silently accepted.
function fallbackIssue(line: RequestLine, index: number, defect: Defect): ValidationIssue {
  const message = defect === 'quantity' ? 'Must be greater than 0' : missingSourceKeyMessage(line.sourceType);
  return { path: ['body', 'ingredients', index, defect].join('.'), code: 'custom', message };
}

// The issue the strict line schema gives for this defect, so a refused line reads
// exactly as on a cocktail creation.
function strictIssues(line: RequestLine, index: number, defect: Defect): ValidationIssue[] {
  const issues = (IngredientLine.safeParse(line).error?.issues ?? [])
    .filter((issue) => issue.path[0] === defect)
    .map((issue) => toValidationIssue(['body', 'ingredients', index], issue));
  return issues.length > 0 ? issues : [fallbackIssue(line, index, defect)];
}

/**
 * Lists the defects of the request lines that the stored recipe does not already have.
 * The first defective lines of each kind, in request order, use up the stored ones.
 */
export function findNewRecipeDefects(lines: RequestLine[], storedLines: StoredLine[]): ValidationIssue[] {
  const allowed = countDefects(storedLines);
  const issues: ValidationIssue[] = [];
  lines.forEach((line, index) => {
    for (const defect of defectsOf(line)) {
      const remaining = allowed.get(defect) ?? 0;
      if (remaining > 0) {
        allowed.set(defect, remaining - 1);
      } else {
        issues.push(...strictIssues(line, index, defect));
      }
    }
  });
  return issues;
}

/** Throws the 400 of the `validate` middleware when the update adds a recipe defect. */
export async function refuseNewRecipeDefects(cocktailId: number, lines: RequestLine[]): Promise<void> {
  if (!lines.some((line) => defectsOf(line).length > 0)) return;
  const storedLines = await prisma.cocktailIngredient.findMany({
    where: { cocktailId },
    select: { sourceType: true, bottleId: true, categoryId: true, ingredientId: true, quantity: true },
  });
  const issues = findNewRecipeDefects(lines, storedLines);
  if (issues.length > 0) throw new BadRequestError('errors.validationError', issues);
}
