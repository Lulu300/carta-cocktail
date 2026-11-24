import i18n from '../i18n';
import { ApiError, type ValidationIssue } from '../services/api';

// Fields of the backend schemas the admin fills in, named after the schema keys (F-05 will
// share those schemas). An issue on another field gets the backend's generic message, and so
// does any issue outside the body (path or query string): the admin could not fix it from the form.
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

const BODY_PREFIX = 'body.';

interface IssueLocation {
  field?: string;
  /** Position in the list the issue is in, counted from 1. */
  row?: number;
  /** Name of that list, e.g. `ingredients` or `bottles`. */
  list?: string;
}

/**
 * Where an issue of the body points: `body.ingredients.1.quantity` is the quantity of row 2.
 * The field is the last named segment, the row the first index, counted from 1.
 *
 * The row is a position in the list the request sent, not a line of a file. In the bottle import,
 * `body.payload.bottles.3` is the fourth row of the wizard's list, whereas the rows the preview
 * left out (E-08) give their line in the CSV file: once rows are left out, the two differ.
 */
function locateIssue(path: string): IssueLocation {
  const segments = path.slice(BODY_PREFIX.length).split('.');
  const field = segments.filter((segment) => !isIndex(segment)).at(-1);
  const indexPosition = segments.findIndex(isIndex);
  if (indexPosition === -1) return { field };
  return { field, row: Number(segments[indexPosition]) + 1, list: segments[indexPosition - 1] };
}

// A row of the import's categories is named as such: "Row 2" alone would read as a bottle.
function messageKey({ row, list }: IssueLocation): string {
  if (row === undefined) return 'validation.issue';
  return list === 'categories' ? 'validation.issueInCategoryRow' : 'validation.issueInRow';
}

function ruleText(field: string, code: string): string {
  if (code === 'too_small' && REQUIRED_TEXT_FIELDS.includes(field)) return i18n.t('validation.blank');
  return i18n.t(`validation.codes.${code}`);
}

/** The issue as the admin reads it ("Row 2, Quantity: too small"), or null when its field or rule is unknown. */
export function describeValidationIssue(issue: ValidationIssue): string | null {
  if (!issue.path.startsWith(BODY_PREFIX)) return null;
  const location = locateIssue(issue.path);
  const { field, row } = location;
  if (field === undefined || !KNOWN_FIELDS.includes(field) || !KNOWN_CODES.includes(issue.code)) return null;
  const values = { field: i18n.t(`validation.fields.${field}`), rule: ruleText(field, issue.code), row };
  return i18n.t(messageKey(location), values);
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
