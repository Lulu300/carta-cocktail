import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import '../i18n/admin';
import { ApiError } from '../services/api';
import { toast, toastStore } from '../components/ui/ToastStore';
import {
  describeUnknownReference,
  describeUnresolvedReference,
  REFERENCE_FIELDS,
  refusalDetails,
  refusalMessage,
  UNRESOLVED_KINDS,
} from './refusalDetails';

function badRequest(message: string, details: unknown): ApiError {
  return new ApiError(400, message, { error: message, details });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('reference messages', () => {
  it.each(['en', 'fr'])('name every known kind and field in %s', (language) => {
    const keys = [
      'validation.unknownReference',
      'validation.unresolved.noUnit',
      ...UNRESOLVED_KINDS.map((kind) => `validation.unresolved.${kind}`),
      ...REFERENCE_FIELDS.map((field) => `validation.fields.${field}`),
    ];
    expect(keys.filter((key) => !i18n.exists(key, { lng: language }))).toEqual([]);
  });
});

describe('describeUnresolvedReference', () => {
  it('names the row, counted from 1, and the item of the file', () => {
    expect(describeUnresolvedReference({ line: 1, kind: 'unit', name: 'cl' })).toBe('Row 2: unit "cl" is neither matched nor created');
    expect(describeUnresolvedReference({ line: 0, kind: 'bottle', name: 'Havana' }))
      .toBe('Row 1: bottle "Havana" is neither matched nor created, or has no category');
  });

  it('reads a row without unit', () => {
    expect(describeUnresolvedReference({ line: 2, kind: 'unit', name: null })).toBe('Row 3: no unit');
  });

  it('is in French when the admin chose French', async () => {
    await i18n.changeLanguage('fr');
    expect(describeUnresolvedReference({ line: 0, kind: 'ingredient', name: 'Menthe' }))
      .toBe('Ligne 1 : ingrédient « Menthe » ni associé ni créé');
  });

  it('names nothing for a kind this version does not know, or a source without name', () => {
    expect(describeUnresolvedReference({ line: 0, kind: 'glass', name: 'Highball' })).toBeNull();
    expect(describeUnresolvedReference({ line: 0, kind: 'category', name: null })).toBeNull();
  });
});

describe('describeUnknownReference', () => {
  it('names the row, counted from 1, and the field', () => {
    expect(describeUnknownReference({ line: 2, field: 'ingredientId', id: 7 }))
      .toBe('Row 3, Ingredient: this item no longer exists, choose another one');
  });

  it('names nothing for a field this version does not know', () => {
    expect(describeUnknownReference({ line: 0, field: 'glassId', id: 1 })).toBeNull();
  });
});

describe('refusalDetails', () => {
  it('lists every reference the import could not resolve', () => {
    const error = badRequest('The recipe cannot be imported', [
      { line: 1, kind: 'unit', name: 'cl' },
      { line: 0, kind: 'bottle', name: 'Havana' },
    ]);
    expect(refusalDetails(error)).toEqual([
      'Row 2: unit "cl" is neither matched nor created',
      'Row 1: bottle "Havana" is neither matched nor created, or has no category',
    ]);
  });

  it('names the validation issues and the unknown references too, each sentence once', () => {
    const error = badRequest('Refused', [
      { path: 'body.ingredients.0.quantity', code: 'too_small' },
      { line: 1, field: 'preferredBottleIds', id: 3 },
      { line: 1, field: 'preferredBottleIds', id: 4 },
    ]);
    expect(refusalDetails(error)).toEqual([
      'Row 1, Quantity: value too small',
      'Row 2, Preferred bottles: this item no longer exists, choose another one',
    ]);
  });

  it('is empty for malformed or unknown details, and for anything but an ApiError', () => {
    expect(refusalDetails(badRequest('Refused', [{ line: 0, kind: 'glass', name: 'Highball' }, 'unit']))).toEqual([]);
    expect(refusalDetails(badRequest('Refused', { line: 0 }))).toEqual([]);
    expect(refusalDetails(new ApiError(409, 'In use', { details: [{ line: 0, field: 'unitId', id: 1 }] }))).toEqual([]);
    expect(refusalDetails(new Error('Boom'))).toEqual([]);
  });
});

describe('refusalMessage', () => {
  afterEach(() => {
    for (const item of toastStore.getSnapshot()) toast.dismiss(item.id);
  });

  it('gives the first detail, or null to keep the backend message', () => {
    const error = badRequest('A recipe line names a unit that does not exist', [
      { line: 0, field: 'unitId', id: 4 },
      { line: 3, field: 'bottleId', id: 5 },
    ]);
    expect(refusalMessage(error)).toBe('Row 1, Unit: this item no longer exists, choose another one');
    expect(refusalMessage(badRequest('Refused', []))).toBeNull();
  });

  it('names the row of an unknown reference in the error toasts of the admin', () => {
    toast.error(badRequest('A recipe line names a unit that does not exist', [{ line: 1, field: 'unitId', id: 4 }]));
    expect(toastStore.getSnapshot().at(-1)?.message).toBe('Row 2, Unit: this item no longer exists, choose another one');
  });
});
