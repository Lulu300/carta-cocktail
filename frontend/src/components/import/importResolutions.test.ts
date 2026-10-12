import { describe, it, expect } from 'vitest';
import type { ImportPreviewResponse } from '../../types';
import {
  buildAutoResolutions,
  countIncompleteResolutions,
  createsEntities,
  defaultCreateData,
  emptyResolutions,
  invalidCreateFields,
  isResolutionComplete,
  parseNumberInput,
  resolutionKey,
} from './importResolutions';

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
    expect(resolutionKey('categories', { name: 'Rhum Blanc', abbreviation: 'RB' })).toBe('rhum blanc');
    expect(resolutionKey('ingredients', {})).toBe('');
  });
});

describe('defaultCreateData', () => {
  it('keeps the unit fields of the file', () => {
    expect(defaultCreateData('units', { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 })).toEqual({
      name: 'Centilitre',
      abbreviation: 'cl',
      conversionFactorToMl: 10,
      nameTranslations: null,
    });
  });

  it('gives a category the backend defaults and keeps a desired stock of 0', () => {
    expect(defaultCreateData('categories', { name: 'Rhum' })).toEqual({
      name: 'Rhum',
      type: 'SPIRIT',
      desiredStock: 1,
      nameTranslations: null,
    });
    expect(defaultCreateData('categories', { name: 'Rhum', type: 'SYRUP', desiredStock: 0 })).toMatchObject({
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
    expect(defaultCreateData('ingredients', { name: 'Mint', icon: '🌿', nameTranslations: { fr: 'Menthe' } })).toEqual({
      name: 'Mint',
      icon: '🌿',
      nameTranslations: { fr: 'Menthe' },
    });
    expect(defaultCreateData('ingredients', {})).toEqual({ name: '', icon: null, nameTranslations: null });
  });
});

describe('buildAutoResolutions', () => {
  it('uses the matched entities and creates the missing ones', () => {
    const resolutions = buildAutoResolutions(preview({
      units: [{ ref: { name: 'Centilitre', abbreviation: 'cl' }, existingMatch: { id: 3, name: 'Centilitre' }, status: 'matched' }],
      ingredients: [{ ref: { name: 'Mint' }, existingMatch: null, status: 'missing' }],
    }));

    expect(resolutions.units).toEqual({ cl: { action: 'use_existing', existingId: 3 } });
    expect(resolutions.ingredients).toEqual({
      mint: { action: 'create', data: { name: 'Mint', icon: null, nameTranslations: null } },
    });
    expect(resolutions.categories).toEqual({});
  });
});

describe('invalidCreateFields', () => {
  it('flags blank names and abbreviations', () => {
    expect(invalidCreateFields('units', { name: ' ', abbreviation: '' })).toEqual(['name', 'abbreviation']);
    expect(invalidCreateFields('ingredients', { name: 'Mint' })).toEqual([]);
  });

  it('flags a missing or invalid bottle capacity', () => {
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: null })).toEqual(['capacityMl']);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 0 })).toEqual(['capacityMl']);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 70.5 })).toEqual(['capacityMl']);
    expect(invalidCreateFields('bottles', { name: 'Havana', capacityMl: 700 })).toEqual([]);
  });

  it('flags a missing or negative desired stock', () => {
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: null })).toEqual(['desiredStock']);
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: -1 })).toEqual(['desiredStock']);
    expect(invalidCreateFields('categories', { name: 'Rhum', desiredStock: 0 })).toEqual([]);
  });
});

describe('isResolutionComplete', () => {
  it('needs an entity to use, valid data to create, nothing to skip', () => {
    expect(isResolutionComplete('units', undefined)).toBe(false);
    expect(isResolutionComplete('units', { action: 'use_existing' })).toBe(false);
    expect(isResolutionComplete('units', { action: 'use_existing', existingId: 1 })).toBe(true);
    expect(isResolutionComplete('ingredients', { action: 'create' })).toBe(false);
    expect(isResolutionComplete('ingredients', { action: 'create', data: { name: '' } })).toBe(false);
    expect(isResolutionComplete('ingredients', { action: 'create', data: { name: 'Mint' } })).toBe(true);
    expect(isResolutionComplete('bottles', { action: 'skip' })).toBe(true);
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
    expect(countIncompleteResolutions(recipePreview, resolutions)).toBe(0);

    resolutions.ingredients.mint = { action: 'create', data: { name: '' } };
    expect(countIncompleteResolutions(recipePreview, resolutions)).toBe(1);
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
