import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { ApiError } from '../services/api';
import { translateWithValues } from '../test/translateWithValues';
import { describeMutationError, readDeletionImpact } from './deletionImpact';

const t = translateWithValues as unknown as TFunction;

function conflict(details: unknown) {
  return new ApiError(409, 'This category still has bottles', { error: 'This category still has bottles', details });
}

function named(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `${prefix} ${index + 1}`, removedLines: 1 }));
}

describe('readDeletionImpact', () => {
  it('reads the cocktails and bottles of a refused deletion', () => {
    const details = { cocktails: named(1, 'Mojito'), bottles: [{ id: 3, name: 'Havana 3' }] };
    expect(readDeletionImpact(conflict(details))).toEqual(details);
  });

  it('ignores a 409 without impact details, such as a slug already taken', () => {
    expect(readDeletionImpact(new ApiError(409, 'Slug taken', { error: 'Slug taken' }))).toBeNull();
    expect(readDeletionImpact(conflict({ cocktails: 'oops', bottles: [] }))).toBeNull();
  });

  it('ignores any other error', () => {
    expect(readDeletionImpact(new ApiError(400, 'Bad request', { details: { cocktails: [], bottles: [] } }))).toBeNull();
    expect(readDeletionImpact(new Error('Failed to fetch'))).toBeNull();
  });
});

describe('describeMutationError', () => {
  it('returns any other error unchanged', () => {
    const error = new Error('Failed to fetch');
    expect(describeMutationError(error, t)).toBe(error);
  });

  it('adds the cocktails and bottles that use the item to the backend message', () => {
    const error = conflict({ cocktails: named(2, 'Mojito'), bottles: [{ id: 3, name: 'Havana 3' }] });

    const described = describeMutationError(error, t) as Error;

    expect(described.message).toBe(
      'This category still has bottles deletion.usedByCocktails(Mojito 1, Mojito 2) deletion.usedByBottles(Havana 3)',
    );
  });

  it('lists five names and counts the others', () => {
    const error = conflict({ cocktails: named(7, 'Cocktail'), bottles: [] });

    const described = describeMutationError(error, t) as Error;

    expect(described.message).toBe(
      'This category still has bottles deletion.usedByCocktails(Cocktail 1, Cocktail 2, Cocktail 3, Cocktail 4, Cocktail 5 deletion.more(2))',
    );
  });
});
