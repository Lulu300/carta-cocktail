import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { buildPublicCocktailSelect } from './includes';

/**
 * Portable JSON format of a cocktail (version 1), read back by the import.
 *
 * The admin export and the public one share this builder and the public select:
 * for a given cocktail they only differ by the private fields (notes and preferred
 * bottles), which a guest never gets. Inventory data such as a category's desired
 * stock is not part of the format; the import still accepts it in older files.
 */

export const COCKTAIL_EXPORT_VERSION = 1;

export interface ExportOptions {
  /** Adds the notes and the preferred bottles: for a verified admin only. */
  includePrivate: boolean;
}

type Translations = string | null;

interface ExportedCategory {
  name: string;
  type: string;
  nameTranslations: Translations;
}

interface ExportedBottle {
  name: string;
  category: ExportedCategory;
}

interface ExportedLine {
  sourceType: string;
  quantity: number;
  position: number;
  unit: { name: string; abbreviation: string; conversionFactorToMl: number | null; nameTranslations: Translations };
  bottle: ExportedBottle | null;
  category: ExportedCategory | null;
  ingredient: { name: string; icon: string | null; nameTranslations: Translations } | null;
  preferredBottles?: { bottle: ExportedBottle }[];
}

/** The fields of a cocktail the export reads, as loaded with the public select. */
export interface ExportedCocktail {
  name: string;
  description: string | null;
  notes?: string | null;
  tags: string;
  ingredients: ExportedLine[];
  instructions: { stepNumber: number; text: string }[];
}

/** Stored translations are a JSON string; an unreadable one is exported as null. */
function parseStoredTranslations(value: Translations): Record<string, string> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function splitTags(tags: string): string[] {
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

// The name of the line's source and what the import needs to create it again
function describeSource(line: ExportedLine): { sourceName: string; sourceDetail: Record<string, unknown> } {
  if (line.sourceType === 'BOTTLE' && line.bottle) {
    const { category } = line.bottle;
    return {
      sourceName: line.bottle.name,
      sourceDetail: {
        categoryName: category.name,
        categoryType: category.type,
        categoryNameTranslations: parseStoredTranslations(category.nameTranslations),
      },
    };
  }
  if (line.sourceType === 'CATEGORY' && line.category) {
    return {
      sourceName: line.category.name,
      sourceDetail: { type: line.category.type, nameTranslations: parseStoredTranslations(line.category.nameTranslations) },
    };
  }
  if (line.sourceType === 'INGREDIENT' && line.ingredient) {
    return {
      sourceName: line.ingredient.name,
      sourceDetail: {
        icon: line.ingredient.icon || null,
        nameTranslations: parseStoredTranslations(line.ingredient.nameTranslations),
      },
    };
  }
  // A line whose source was deleted before v1.7.0
  return { sourceName: '', sourceDetail: {} };
}

function exportLine(line: ExportedLine, { includePrivate }: ExportOptions) {
  return {
    sourceType: line.sourceType,
    ...describeSource(line),
    quantity: line.quantity,
    unit: {
      name: line.unit.name,
      abbreviation: line.unit.abbreviation,
      conversionFactorToMl: line.unit.conversionFactorToMl,
      nameTranslations: parseStoredTranslations(line.unit.nameTranslations),
    },
    position: line.position,
    ...(includePrivate && {
      preferredBottles: (line.preferredBottles ?? []).map(({ bottle }) => ({
        name: bottle.name,
        categoryName: bottle.category.name,
      })),
    }),
  };
}

export function buildCocktailExport(cocktail: ExportedCocktail, options: ExportOptions) {
  return {
    version: COCKTAIL_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    cocktail: {
      name: cocktail.name,
      description: cocktail.description || null,
      ...(options.includePrivate && { notes: cocktail.notes || null }),
      tags: splitTags(cocktail.tags),
      ingredients: cocktail.ingredients.map((line) => exportLine(line, options)),
      instructions: cocktail.instructions.map(({ stepNumber, text }) => ({ stepNumber, text })),
    },
  };
}

/**
 * Name of the downloaded file: accents are kept as their base letter
 * ("Piña Colada" gives cocktail-pina-colada.json). A name with no latin letter
 * or digit falls back on the id.
 */
export function exportFilename(name: string, id: number): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `cocktail-${slug || id}.json`;
}

export interface CocktailExportFile {
  filename: string;
  payload: ReturnType<typeof buildCocktailExport>;
}

/** Loads the first cocktail matching `where` and builds its export, or null when none matches. */
export async function exportCocktail(
  where: Prisma.CocktailWhereInput,
  options: ExportOptions,
): Promise<CocktailExportFile | null> {
  const cocktail = await prisma.cocktail.findFirst({ where, select: buildPublicCocktailSelect(options.includePrivate) });
  if (!cocktail) return null;
  return { filename: exportFilename(cocktail.name, cocktail.id), payload: buildCocktailExport(cocktail, options) };
}
