import { describe, it, expect } from 'vitest';
import { buildCategory, buildCategoryType, buildUnit } from '../../test/factories';
import type { CategoryType, ImportPreviewResponse } from '../../types';
import {
  buildAutoResolutions,
  countIncompleteResolutions,
  createsEntities,
  defaultCreateData,
  emptyResolutions,
  existingRowFor,
  matchIgnoringCase,
  referenceLabel,
  invalidCreateFields,
  isMissingCategoryType,
  isResolutionComplete,
  parseNumberInput,
  resolutionKey,
  type ExistingRows,
} from './importResolutions';

function rows(
  categoryTypes: CategoryType[] = [],
  others: Partial<ExistingRows> = {},
): ExistingRows {
  return { categoryTypes, categories: [], units: [], ...others };
}

// Data older than C-07 can hold two categories or two units that differ only by case
const rhum = buildCategory({ id: 1, name: 'Rhum' });
const upperRhum = buildCategory({ id: 2, name: 'RHUM' });
const gin = buildCategory({ id: 3, name: 'Gin' });
const upperCl = buildUnit({ id: 1, name: 'Centilitre', abbreviation: 'CL' });
const titleCl = buildUnit({ id: 2, name: 'Centilitre', abbreviation: 'Cl' });
const twinRows = rows([], { categories: [rhum, upperRhum, gin], units: [upperCl, titleCl] });

function preview(overrides: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    cocktail: { name: 'Mojito', description: null, tags: [], alreadyExists: false },
    units: [],
    categories: [],
    bottles: [],
    ingredients: [],
    ...overrides,
  };
}

describe('resolutionKey', () => {
  it('keys a unit by its lowercased abbreviation', () => {
    expect(resolutionKey('units', { name: 'Centilitre', abbreviation: 'CL' })).toBe('cl');
  });

  it('keys a unit without abbreviation by its name', () => {
    expect(resolutionKey('units', { name: 'Dash' })).toBe('dash');
    expect(resolutionKey('units', { name: 'Dash', abbreviation: '' })).toBe('dash');
  });

  it('keys other entities by their lowercased name, never the abbreviation', () => {
    expect(resolutionKey('categories', { name: 'Rhum Blanc', abbreviation: 'RB' })).toBe(
      'rhum blanc',
    );
    expect(resolutionKey('ingredients', {})).toBe('');
  });
});

describe('referenceLabel', () => {
  it('shows the abbreviation of a unit, and never "undefined"', () => {
    expect(referenceLabel('units', { name: 'Centilitre', abbreviation: 'cl' })).toBe(
      'Centilitre (cl)',
    );
    expect(referenceLabel('units', { abbreviation: 'cl' })).toBe('cl');
    expect(referenceLabel('units', { name: 'Dash' })).toBe('Dash');
    expect(referenceLabel('units', {})).toBe('');
  });

  it('shows the name of other entities', () => {
    expect(referenceLabel('ingredients', { name: 'Mint', abbreviation: 'M' })).toBe('Mint');
    expect(referenceLabel('ingredients', {})).toBe('');
  });
});

describe('defaultCreateData', () => {
  it('keeps the unit fields of the file', () => {
    expect(
      defaultCreateData('units', {
        name: 'Centilitre',
        abbreviation: 'cl',
        conversionFactorToMl: 10,
      }),
    ).toEqual({
      name: 'Centilitre',
      abbreviation: 'cl',
      conversionFactorToMl: 10,
      nameTranslations: null,
    });
  });

  it('names a unit without a name after its abbreviation, as the backend does', () => {
    expect(defaultCreateData('units', { abbreviation: 'cl' })).toMatchObject({
      name: 'cl',
      abbreviation: 'cl',
    });
    expect(defaultCreateData('units', {})).toMatchObject({ name: '', abbreviation: '' });
    expect(
      invalidCreateFields('units', defaultCreateData('units', { abbreviation: 'cl' }), rows()),
    ).toEqual([]);
  });

  it('gives a category the backend defaults and keeps a desired stock of 0', () => {
    expect(defaultCreateData('categories', { name: 'Rhum' })).toEqual({
      name: 'Rhum',
      type: 'SPIRIT',
      desiredStock: 1,
      nameTranslations: null,
    });
    expect(
      defaultCreateData('categories', { name: 'Rhum', type: 'SYRUP', desiredStock: 0 }),
    ).toMatchObject({
      type: 'SYRUP',
      desiredStock: 0,
    });
  });

  it('gives a bottle a standard capacity, full', () => {
    expect(defaultCreateData('bottles', { name: 'Havana 3', categoryName: 'Rhum' })).toEqual({
      name: 'Havana 3',
      categoryName: 'Rhum',
      capacityMl: 700,
      remainingPercent: 100,
    });
  });

  it('keeps the icon and translations of an ingredient', () => {
    expect(
      defaultCreateData('ingredients', {
        name: 'Mint',
        icon: '🌿',
        nameTranslations: { fr: 'Menthe' },
      }),
    ).toEqual({
      name: 'Mint',
      icon: '🌿',
      nameTranslations: { fr: 'Menthe' },
    });
    expect(defaultCreateData('ingredients', {})).toEqual({
      name: '',
      icon: null,
      nameTranslations: null,
    });
  });
});

describe('buildAutoResolutions', () => {
  it('uses the matched entities and creates the missing ones', () => {
    const resolutions = buildAutoResolutions(
      preview({
        units: [
          {
            ref: { name: 'Centilitre', abbreviation: 'cl' },
            existingMatch: { id: 3, name: 'Centilitre' },
            status: 'matched',
          },
        ],
        ingredients: [{ ref: { name: 'Mint' }, existingMatch: null, status: 'missing' }],
      }),
    );

    expect(resolutions.units).toEqual({ cl: { action: 'use_existing', existingId: 3 } });
    expect(resolutions.ingredients).toEqual({
      mint: { action: 'create', data: { name: 'Mint', icon: null, nameTranslations: null } },
    });
    expect(resolutions.categories).toEqual({});
  });

  it('leaves an entity several rows match ignoring case for the admin to resolve', () => {
    const resolutions = buildAutoResolutions(
      preview({
        categories: [
          {
            ref: { name: 'rhum' },
            existingMatch: null,
            status: 'ambiguous',
            ambiguousMatches: [rhum, upperRhum],
          },
        ],
        units: [
          {
            ref: { abbreviation: 'cl' },
            existingMatch: null,
            status: 'ambiguous',
            ambiguousMatches: [upperCl, titleCl],
          },
        ],
      }),
    );

    expect(resolutions.categories).toEqual({});
    expect(resolutions.units).toEqual({});
  });
});

describe('matchIgnoringCase', () => {
  const byName = (row: { name: string }) => row.name;

  it('finds the exact row before the others equal ignoring case', () => {
    expect(matchIgnoringCase([rhum, upperRhum], 'RHUM', byName)).toEqual({
      status: 'found',
      row: upperRhum,
    });
  });

  it('finds the only row equal ignoring case', () => {
    expect(matchIgnoringCase([rhum, gin], 'rhum', byName)).toEqual({ status: 'found', row: rhum });
  });

  it('is ambiguous when several rows are equal ignoring case and none exactly', () => {
    expect(matchIgnoringCase([rhum, gin, upperRhum], 'rHum', byName)).toEqual({
      status: 'ambiguous',
      rows: [rhum, upperRhum],
    });
  });

  it('finds nothing for a value no row holds', () => {
    expect(matchIgnoringCase([rhum, gin], 'Vodka', byName)).toEqual({ status: 'none' });
  });

  // Same cases as CaseInsensitiveIndex.match in backend/src/utils/uniqueness.test.ts (C-65)
  const named = (id: number, name: string) => ({ id, name });

  it('finds the only row equal ignoring case and Unicode form, accents included', () => {
    const cream = named(1, 'Cr\u00E8me');
    const decomposedCream = named(2, 'Cre\u0300me');
    const peel = named(3, '\u00C9corce');

    expect(matchIgnoringCase([cream, gin], 'Cre\u0300me', byName)).toEqual({
      status: 'found',
      row: cream,
    });
    expect(matchIgnoringCase([decomposedCream], 'CR\u00C8ME', byName)).toEqual({
      status: 'found',
      row: decomposedCream,
    });
    expect(matchIgnoringCase([peel], '\u00E9corce', byName)).toEqual({
      status: 'found',
      row: peel,
    });
  });

  it('is ambiguous between a name and its decomposed form, unless one is exact', () => {
    const cream = named(1, 'Cr\u00E8me');
    const decomposedCream = named(2, 'Cre\u0300me');

    expect(matchIgnoringCase([cream, decomposedCream], 'CR\u00C8ME', byName)).toEqual({
      status: 'ambiguous',
      rows: [cream, decomposedCream],
    });
    expect(matchIgnoringCase([cream, decomposedCream], 'Cre\u0300me', byName)).toEqual({
      status: 'found',
      row: decomposedCream,
    });
  });

  it('matches a Greek letter that upper case decomposes, as the backend does', () => {
    const dialytika = named(1, '\u0390');

    expect(matchIgnoringCase([dialytika], '\u0399\u0308\u0301', byName)).toEqual({
      status: 'found',
      row: dialytika,
    });
    expect(matchIgnoringCase([dialytika], '\u03AA\u0301', byName)).toEqual({
      status: 'found',
      row: dialytika,
    });
  });
});

describe('existingRowFor', () => {
  it('compares a category by its trimmed name and a unit by its trimmed abbreviation', () => {
    expect(existingRowFor('categories', { name: ' gin ' }, twinRows)).toEqual({
      status: 'found',
      row: gin,
    });
    expect(existingRowFor('categories', { name: 'rhum' }, twinRows)).toEqual({
      status: 'ambiguous',
      rows: [rhum, upperRhum],
    });
    // A unit's name is not unique: only its abbreviation counts
    expect(existingRowFor('units', { name: 'Centilitre', abbreviation: ' Cl ' }, twinRows)).toEqual(
      { status: 'found', row: titleCl },
    );
    expect(existingRowFor('units', { name: 'Centilitre', abbreviation: 'cl' }, twinRows)).toEqual({
      status: 'ambiguous',
      rows: [upperCl, titleCl],
    });
  });

  it('never matches a bottle or an ingredient, which are always created', () => {
    expect(existingRowFor('bottles', { name: 'Rhum' }, twinRows)).toEqual({ status: 'none' });
    expect(existingRowFor('ingredients', { name: 'Gin' }, twinRows)).toEqual({ status: 'none' });
  });
});

// Data older than v1.9.0 can hold a type with an empty name, or made only of spaces.
const unnamedType = buildCategoryType({ name: '' });
const spacesType = buildCategoryType({ name: '   ' });
const spacedSpirit = buildCategoryType({ name: ' SPIRIT ' });

describe('isMissingCategoryType', () => {
  it('refuses the empty name, even when a type has it', () => {
    expect(isMissingCategoryType('', [])).toBe(true);
    expect(isMissingCategoryType('', [unnamedType])).toBe(true);
  });

  it('refuses a new type made only of blanks or invisible characters', () => {
    for (const blank of ['   ', '\t', '\u200B', '\u2800', ' \u2060 ']) {
      expect(isMissingCategoryType(blank, [unnamedType, spacedSpirit])).toBe(true);
    }
  });

  it('keeps an existing type exactly as picked, spaces included', () => {
    expect(isMissingCategoryType('   ', [spacesType])).toBe(false);
    expect(isMissingCategoryType(' SPIRIT ', [spacedSpirit])).toBe(false);
    expect(isMissingCategoryType(' SPIRIT ', [])).toBe(false);
    expect(isMissingCategoryType('SPIRIT', [])).toBe(false);
  });
});

describe('invalidCreateFields', () => {
  it('flags blank names and abbreviations', () => {
    expect(invalidCreateFields('units', { name: ' ', abbreviation: '' }, rows())).toEqual([
      'name',
      'abbreviation',
    ]);
    expect(invalidCreateFields('ingredients', { name: 'Mint' }, rows())).toEqual([]);
  });

  it('flags a missing or invalid bottle capacity', () => {
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: null }, rows())).toEqual([
      'capacityMl',
    ]);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 0 }, rows())).toEqual([
      'capacityMl',
    ]);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 70.5 }, rows())).toEqual([
      'capacityMl',
    ]);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 700 }, rows())).toEqual([]);
  });

  it('flags a missing or negative desired stock', () => {
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: null }, rows())).toEqual(
      ['desiredStock'],
    );
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: -1 }, rows())).toEqual([
      'desiredStock',
    ]);
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: 0 }, rows())).toEqual(
      [],
    );
  });

  it('flags a category type the backend refuses, and no other', () => {
    expect(
      invalidCreateFields(
        'categories',
        { name: 'Rhum', type: '', desiredStock: 1 },
        rows([unnamedType]),
      ),
    ).toEqual(['type']);
    expect(
      invalidCreateFields('categories', { name: 'Rhum', type: '\u200B', desiredStock: 1 }, rows()),
    ).toEqual(['type']);
    expect(
      invalidCreateFields(
        'categories',
        { name: 'Rhum', type: ' SPIRIT ', desiredStock: 1 },
        rows([spacedSpirit]),
      ),
    ).toEqual([]);
    expect(
      invalidCreateFields(
        'categories',
        { name: 'Rhum', type: '   ', desiredStock: 1 },
        rows([spacesType]),
      ),
    ).toEqual([]);
    // Sent without a type, a category gets the backend's default
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: 1 }, rows())).toEqual(
      [],
    );
  });

  it('flags a category name or a unit abbreviation several rows hold ignoring case, the backend refuses it', () => {
    expect(invalidCreateFields('categories', { name: 'rhum', desiredStock: 1 }, twinRows)).toEqual([
      'name',
    ]);
    expect(
      invalidCreateFields('units', { name: 'Centilitre', abbreviation: 'cl' }, twinRows),
    ).toEqual(['abbreviation']);
  });

  it('accepts a name that exists once ignoring case: the backend uses that row', () => {
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: 1 }, twinRows)).toEqual(
      [],
    );
    expect(invalidCreateFields('categories', { name: 'GIN', desiredStock: 1 }, twinRows)).toEqual(
      [],
    );
    expect(
      invalidCreateFields('units', { name: 'Centilitre', abbreviation: 'CL' }, twinRows),
    ).toEqual([]);
  });
});

describe('isResolutionComplete', () => {
  it('needs an entity to use, valid data to create, nothing to skip', () => {
    expect(isResolutionComplete('units', undefined, rows())).toBe(false);
    expect(isResolutionComplete('units', { action: 'use_existing' }, rows())).toBe(false);
    expect(isResolutionComplete('units', { action: 'use_existing', existingId: 1 }, rows())).toBe(
      true,
    );
    expect(isResolutionComplete('ingredients', { action: 'create' }, rows())).toBe(false);
    expect(
      isResolutionComplete('ingredients', { action: 'create', data: { name: '' } }, rows()),
    ).toBe(false);
    expect(
      isResolutionComplete('ingredients', { action: 'create', data: { name: 'Mint' } }, rows()),
    ).toBe(true);
    expect(isResolutionComplete('bottles', { action: 'skip' }, rows())).toBe(true);
  });
});

describe('countIncompleteResolutions', () => {
  it('counts the entities that cannot be sent as they are', () => {
    const recipePreview = preview({
      ingredients: [
        { ref: { name: 'Mint' }, existingMatch: null, status: 'missing' },
        { ref: { name: 'Lime' }, existingMatch: null, status: 'missing' },
      ],
    });
    const resolutions = buildAutoResolutions(recipePreview);
    expect(countIncompleteResolutions(recipePreview, resolutions, rows())).toBe(0);

    resolutions.ingredients.mint = { action: 'create', data: { name: '' } };
    expect(countIncompleteResolutions(recipePreview, resolutions, rows())).toBe(1);
  });

  it('counts a category to create under the type with an empty name', () => {
    const recipePreview = preview({
      categories: [
        { ref: { name: 'Rhum', type: 'SPIRIT' }, existingMatch: null, status: 'missing' },
      ],
    });
    const resolutions = buildAutoResolutions(recipePreview);
    expect(countIncompleteResolutions(recipePreview, resolutions, rows([unnamedType]))).toBe(0);

    resolutions.categories.rhum = {
      action: 'create',
      data: { name: 'Rhum', type: '', desiredStock: 1 },
    };
    expect(countIncompleteResolutions(recipePreview, resolutions, rows([unnamedType]))).toBe(1);
  });

  it('counts a category several rows match until one of them is picked, or another name is typed', () => {
    const recipePreview = preview({
      categories: [
        {
          ref: { name: 'rhum' },
          existingMatch: null,
          status: 'ambiguous',
          ambiguousMatches: [rhum, upperRhum],
        },
      ],
    });
    const resolutions = buildAutoResolutions(recipePreview);
    expect(countIncompleteResolutions(recipePreview, resolutions, twinRows)).toBe(1);

    resolutions.categories.rhum = { action: 'use_existing' };
    expect(countIncompleteResolutions(recipePreview, resolutions, twinRows)).toBe(1);

    resolutions.categories.rhum = {
      action: 'create',
      data: defaultCreateData('categories', { name: 'rhum' }),
    };
    expect(countIncompleteResolutions(recipePreview, resolutions, twinRows)).toBe(1);

    resolutions.categories.rhum = { action: 'use_existing', existingId: upperRhum.id };
    expect(countIncompleteResolutions(recipePreview, resolutions, twinRows)).toBe(0);

    resolutions.categories.rhum = {
      action: 'create',
      data: defaultCreateData('categories', { name: 'Rhum blanc' }),
    };
    expect(countIncompleteResolutions(recipePreview, resolutions, twinRows)).toBe(0);
  });
});

describe('createsEntities', () => {
  it('is true only when a resolution creates an entity', () => {
    const resolutions = emptyResolutions();
    resolutions.units.cl = { action: 'use_existing', existingId: 1 };
    resolutions.bottles.havana = { action: 'skip' };
    expect(createsEntities(resolutions)).toBe(false);

    resolutions.ingredients.mint = { action: 'create', data: { name: 'Mint' } };
    expect(createsEntities(resolutions)).toBe(true);
  });
});

describe('parseNumberInput', () => {
  it('reads a number, and gives null for an empty field', () => {
    expect(parseNumberInput('750')).toBe(750);
    expect(parseNumberInput('0')).toBe(0);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('  ')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
  });
});
