import { z } from 'zod';

// Schemas in this folder never import Prisma: they describe the HTTP contract only,
// so the frontend can share them later (task F-05).

/** Database id sent in a JSON body. The UI always sends numbers, never strings. */
export const Id = z.number().int().positive();

/** Database id in the path. Path segments are strings: they are coerced to numbers. */
export const PathId = z.coerce.number().int().positive();

export const IdParams = z.object({ id: PathId });
export const MenuIdParams = z.object({ menuId: PathId });

/** Schemas of a route that only reads `:id`, e.g. `validate(idRequest)`. */
export const idRequest = { params: IdParams };

/** DELETE with an optional `?force=true`; `isForceRequested` reads the value. */
export const deleteRequest = { params: IdParams, query: z.object({ force: z.string().optional() }) };

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
 * rejects unknown languages. `serializeTranslations` (task C-14) must apply the same rule.
 */
export const Translations = z.partialRecord(z.enum(SUPPORTED_LANGUAGES), z.string().trim()).nullable();

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
