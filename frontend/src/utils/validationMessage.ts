import i18n from '../i18n';
import { ApiError, type ValidationIssue } from '../services/api';

// Fields of the backend schemas the admin fills in, named after the schema keys (F-05 will
// share those schemas). An issue on another field, an id in the URL for instance, gets the
// backend's generic message: the admin could not fix it from the form anyway.
export const KNOWN_FIELDS: readonly string[] = [
  'name', 'slug', 'abbreviation', 'type', 'description', 'color', 'instructions',
  'capacityMl', 'remainingPercent', 'alcoholPercentage', 'purchasePrice', 'openedAt', 'location', 'quantity',
  'categoryName', 'categoryId', 'bottleId', 'ingredientId', 'unitId', 'preferredBottleIds',
  'desiredStock', 'minimumPercent', 'conversionFactorToMl',
];

// zod codes this version can name; a newer backend may send others.
export const KNOWN_CODES: readonly string[] = [
  'invalid_type', 'too_small', 'too_big', 'invalid_value', 'invalid_format', 'custom',
];

// Required texts are trimmed then checked with min(1): a blank one fails with too_small,
// which reads better as "required".
const REQUIRED_TEXT_FIELDS: readonly string[] = ['name', 'slug', 'abbreviation', 'type', 'instructions'];

function isIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}

/**
 * Where an issue points: `body.ingredients.1.quantity` is the quantity of row 2. The first
 * segment (params, query or body) is dropped; the field is the last named segment, the row
 * the first index, counted from 1.
 */
function locateIssue(path: string): { field?: string; row?: number } {
  const segments = path.split('.').slice(1);
  const field = segments.filter((segment) => !isIndex(segment)).at(-1);
  const index = segments.find(isIndex);
  return { field, row: index === undefined ? undefined : Number(index) + 1 };
}

function ruleText(field: string, code: string): string {
  if (code === 'too_small' && REQUIRED_TEXT_FIELDS.includes(field)) return i18n.t('validation.blank');
  return i18n.t(`validation.codes.${code}`);
}

/** The issue as the admin reads it ("Row 2, Quantity: too small"), or null when its field or rule is unknown. */
export function describeValidationIssue(issue: ValidationIssue): string | null {
  const { field, row } = locateIssue(issue.path);
  if (field === undefined || !KNOWN_FIELDS.includes(field) || !KNOWN_CODES.includes(issue.code)) return null;
  const values = { field: i18n.t(`validation.fields.${field}`), rule: ruleText(field, issue.code) };
  return row === undefined ? i18n.t('validation.issue', values) : i18n.t('validation.issueInRow', { ...values, row });
}

/**
 * The message of a 400 refused by the backend's validation: its first issue the admin can
 * act on. The admin fixes that field and saves again; the next one, if any, shows then.
 * Null for any other error, or when no issue can be named: the caller keeps the backend's message.
 */
export function validationErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  for (const issue of error.validationIssues()) {
    const message = describeValidationIssue(issue);
    if (message) return message;
  }
  return null;
}
