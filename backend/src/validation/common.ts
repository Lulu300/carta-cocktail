import { z } from 'zod';

// Schemas in this folder never import Prisma: they describe the HTTP contract only.
// The frontend gets their types from frontend/src/types/generated.ts, generated from
// src/contracts/frontendTypes.ts by `npm run contracts:generate` (task F-05).

/** Database id sent in a JSON body. The UI always sends numbers, never strings. */
export const Id = z.number().int().positive();

/** Database id in the path. Path segments are strings: they are coerced to numbers. */
export const PathId = z.coerce.number().int().positive();

export const IdParams = z.object({ id: PathId });
export const MenuIdParams = z.object({ menuId: PathId });

/** Schemas of a route that only reads `:id`, e.g. `validate(idRequest)`. */
export const idRequest = { params: IdParams };

/** DELETE with an optional `?force=true`; `isForceRequested` reads the value. */
export const deleteRequest = {
  params: IdParams,
  query: z.object({ force: z.string().optional() }),
};

export const OptionalIntQuery = z.coerce.number().int().positive().optional();

export const Percent = z.number().int().min(0).max(100);

/** Rank of an item in an ordered list. */
export const Position = z.number().int().min(0);

/** A name or label that cannot be blank. Surrounding spaces are removed. */
export const RequiredText = z.string().trim().min(1);

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

/**
 * Translated names, e.g. { fr: 'Rhum', en: 'Rum' }. Every language is optional:
 * the forms only send the languages the admin filled in. A partial record also
 * rejects unknown languages. `serializeTranslations` (utils/translations.ts) stores its output.
 */
export const Translations = z
  .partialRecord(z.enum(SUPPORTED_LANGUAGES), z.string().trim())
  .nullable();

function isParsableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Optional date such as `2026-10-11` (date input) or a full ISO timestamp (exports).
 * Any string `Date` can read is accepted, as before; an empty string or null clears it.
 */
export const NullableDate = z
  .string()
  .refine((value) => value === '' || isParsableDate(value), { message: 'Invalid date' })
  .nullable()
  .transform((value) => (value ? new Date(value) : null));

// Response building blocks. Response schemas are strict: a field the backend starts sending
// fails the contract tests until the schema, and so the frontend types, list it.

/** A date as a response sends it: JSON turns Prisma's DateTime into an ISO string. */
export const Timestamp = z.iso.datetime();

/**
 * Translated names as a response sends them (`parseNameTranslations`). Rows written before
 * the `Translations` schema may hold other languages: any language key is kept.
 */
export const StoredTranslations = z.record(z.string(), z.string()).nullable();

/** Answer of a deletion that reports nothing else. */
export const MessageResponse = z.strictObject({ message: z.string() });

/** What a deletion breaks: `details` of a deletion refused with a 409, `impact` once it is done. */
export const DeletionImpact = z.strictObject({
  /** Recipes that use the item: a forced deletion removes `removedLines` lines from each. */
  cocktails: z.array(z.strictObject({ id: Id, name: z.string(), removedLines: z.number().int() })),
  /** Bottles of a category, deleted with it. */
  bottles: z.array(z.strictObject({ id: Id, name: z.string() })),
});

export const DeletionResponse = z.strictObject({
  message: z.string(),
  deleted: z.boolean(),
  impact: DeletionImpact,
});

export const ImportMatchStatus = z.enum(['matched', 'missing', 'ambiguous']);

/**
 * How an entity an import names compares with the existing rows (`previewMatch`,
 * utils/uniqueness.ts): `ref` as the file gives it, and the row found, if any.
 */
export function importMatch<Ref extends z.ZodType, Row extends z.ZodType>(ref: Ref, row: Row) {
  return z.strictObject({
    ref,
    existingMatch: row.nullable(),
    status: ImportMatchStatus,
    /** `ambiguous` only: the rows equal to the name ignoring case, none of them exactly. */
    ambiguousMatches: z.array(row).optional(),
  });
}
