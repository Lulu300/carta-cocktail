import type { z } from 'zod';
import type { Translations as TranslationsSchema } from '../validation/common';
import { isRecord } from './records';

/** Translated names sent by a client, already checked by the `Translations` schema. */
export type TranslationsInput = z.output<typeof TranslationsSchema>;

/**
 * Translated names read from the database, keyed by language. Rows written before
 * the `Translations` schema may hold other languages: they are kept as they are.
 */
export type StoredTranslations = Record<string, string>;

/** Relation fields that may hold entities with their own nameTranslations. */
const RELATION_KEYS = [
  'unit', 'category', 'categoryType', 'ingredient', 'bottle', 'bottles',
  'ingredients', 'cocktail', 'cocktails', 'preferredBottles',
];

/**
 * Client value -> `nameTranslations` column, which SQLite stores as a JSON string.
 * `undefined` (field absent) leaves the column untouched; blank languages are left
 * out, and no translation at all clears the column.
 */
export function serializeTranslations(value: TranslationsInput | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const filled = Object.entries(value ?? {}).filter(([, text]) => text);
  return filled.length > 0 ? JSON.stringify(Object.fromEntries(filled)) : null;
}

/** `nameTranslations` column -> object. An unreadable value is logged and read as null. */
export function parseTranslations(raw: string | null | undefined): StoredTranslations | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed as StoredTranslations;
  } catch {
    // Same answer as a JSON value that is not an object, below
  }
  console.warn(`Ignoring unreadable nameTranslations: ${raw}`);
  return null;
}

/**
 * Recursively parse the nameTranslations JSON strings of entities and of their
 * relations, for `res.json()`. Returns a copy: the input is left untouched.
 *
 * The result's shape is no longer the input's (a string became an object): it is
 * `unknown` rather than the input type.
 */
export function parseNameTranslations(value: unknown): unknown {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(parseNameTranslations);
  if (!isRecord(value)) return value;

  const copy: Record<string, unknown> = { ...value };
  if (typeof value.nameTranslations === 'string') {
    copy.nameTranslations = parseTranslations(value.nameTranslations);
  }
  for (const key of RELATION_KEYS) {
    if (value[key]) {
      copy[key] = parseNameTranslations(value[key]);
    }
  }
  return copy;
}
