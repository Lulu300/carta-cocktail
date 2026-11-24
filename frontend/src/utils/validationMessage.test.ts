import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import '../i18n/admin';
import { ApiError } from '../services/api';
import { toast, toastStore } from '../components/ui/ToastStore';
import { describeValidationIssue, KNOWN_CODES, KNOWN_FIELDS, validationErrorMessage } from './validationMessage';

function validationError(details: unknown): ApiError {
  return new ApiError(400, 'Validation error', { error: 'Validation error', details });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('validation messages', () => {
  it.each(['en', 'fr'])('name every known field and code in %s', (language) => {
    const keys = [
      ...KNOWN_FIELDS.map((field) => `validation.fields.${field}`),
      ...KNOWN_CODES.map((code) => `validation.codes.${code}`),
    ];
    expect(keys.filter((key) => !i18n.exists(key, { lng: language }))).toEqual([]);
  });
});

describe('describeValidationIssue', () => {
  it('names the field and the rule', () => {
    expect(describeValidationIssue({ path: 'body.capacityMl', code: 'too_small' })).toBe('Capacity (ml): value too small');
  });

  it('names the row of an issue inside a list, counted from 1', () => {
    expect(describeValidationIssue({ path: 'body.ingredients.1.quantity', code: 'too_small' }))
      .toBe('Row 2, Quantity: value too small');
  });

  it('names the row of an imported bottle', () => {
    expect(describeValidationIssue({ path: 'body.payload.bottles.3.remainingPercent', code: 'too_big' }))
      .toBe('Row 4, Remaining (%): value too large');
  });

  it('names a row of the imported categories as a category', () => {
    expect(describeValidationIssue({ path: 'body.payload.categories.1.name', code: 'too_small' }))
      .toBe('Category 2, Name: required');
  });

  it('says a blank required text is required', () => {
    expect(describeValidationIssue({ path: 'body.name', code: 'too_small' })).toBe('Name: required');
  });

  it('keeps "too small" for a number', () => {
    expect(describeValidationIssue({ path: 'body.desiredStock', code: 'too_small' })).toBe('Desired stock: value too small');
  });

  it('speaks the language chosen in the UI', async () => {
    await i18n.changeLanguage('fr');
    expect(describeValidationIssue({ path: 'body.ingredients.0.bottleId', code: 'custom' }))
      .toBe('Ligne 1, Bouteille : valeur invalide');
    expect(describeValidationIssue({ path: 'body.name', code: 'too_small' })).toBe('Nom : obligatoire');
    expect(describeValidationIssue({ path: 'body.payload.categories.0.type', code: 'too_small' }))
      .toBe('Catégorie 1, Type : obligatoire');
  });

  it.each([
    ['an unknown field', { path: 'body.secretField', code: 'too_small' }],
    ['an id in the URL', { path: 'params.id', code: 'too_small' }],
    ['a known field of the query string', { path: 'query.categoryId', code: 'invalid_type' }],
    ['a known field of the path', { path: 'params.name', code: 'too_small' }],
    ['an unknown code', { path: 'body.name', code: 'not_a_zod_code' }],
    ['a field the backend names after an object method', { path: 'body.constructor', code: 'custom' }],
    ['the whole body', { path: 'body', code: 'invalid_type' }],
    ['a list without a named field', { path: 'body.0', code: 'invalid_type' }],
  ])('gives up on %s, never showing a raw key', (_case, issue) => {
    expect(describeValidationIssue(issue)).toBeNull();
  });
});

describe('validationErrorMessage', () => {
  it('describes the first issue it can name', () => {
    const error = validationError([
      { path: 'params.id', code: 'too_small', message: 'Too small' },
      { path: 'body.ingredients.1.quantity', code: 'too_small', message: 'Too small' },
      { path: 'body.name', code: 'too_small', message: 'Too small' },
    ]);
    expect(validationErrorMessage(error)).toBe('Row 2, Quantity: value too small');
  });

  it('is null when no issue can be named, so the generic message stays', () => {
    expect(validationErrorMessage(validationError([{ path: 'body.secretField', code: 'custom' }]))).toBeNull();
    expect(validationErrorMessage(validationError(undefined))).toBeNull();
    expect(validationErrorMessage(validationError([{ line: 2, kind: 'bottle', name: 'Rum' }]))).toBeNull();
  });

  it('is null for anything but an ApiError', () => {
    expect(validationErrorMessage(new Error('Validation error'))).toBeNull();
    expect(validationErrorMessage('body.name')).toBeNull();
  });
});

describe('error toasts once the admin messages are loaded', () => {
  afterEach(() => {
    toastStore.getSnapshot().forEach((item) => toast.dismiss(item.id));
  });

  it('name the refused field instead of the generic validation message', () => {
    toast.error(validationError([{ path: 'body.name', code: 'too_small', message: 'Too small' }]));
    toast.error(validationError([{ path: 'body.secretField', code: 'custom', message: 'Invalid' }]));

    expect(toastStore.getSnapshot().map((item) => item.message)).toEqual(['Name: required', 'Validation error']);
  });
});
