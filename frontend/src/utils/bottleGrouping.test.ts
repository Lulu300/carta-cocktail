import { describe, it, expect } from 'vitest';
import type { Bottle } from '../types';
import { bottleGroupKey, groupBottles, isGroup } from './bottleGrouping';

function bottle(overrides: Partial<Bottle>): Bottle {
  return {
    id: 1,
    name: 'Havana 3',
    categoryId: 10,
    purchasePrice: null,
    capacityMl: 700,
    remainingPercent: 100,
    openedAt: null,
    alcoholPercentage: 40,
    location: null,
    isApero: false,
    isDigestif: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('bottleGroupKey', () => {
  it('ignores the case of the name', () => {
    expect(bottleGroupKey(bottle({ name: 'HAVANA 3' }))).toBe(bottleGroupKey(bottle({ name: 'havana 3' })));
  });

  it('tells apart bottles of another capacity, category or strength', () => {
    const reference = bottleGroupKey(bottle({}));
    expect(bottleGroupKey(bottle({ capacityMl: 1000 }))).not.toBe(reference);
    expect(bottleGroupKey(bottle({ categoryId: 11 }))).not.toBe(reference);
    expect(bottleGroupKey(bottle({ alcoholPercentage: null }))).not.toBe(reference);
  });
});

describe('groupBottles', () => {
  it('keeps a product with a single bottle as a plain bottle', () => {
    const single = bottle({ id: 1 });

    const result = groupBottles([single]);

    expect(result).toEqual([single]);
    expect(isGroup(result[0])).toBe(false);
  });

  it('groups the bottles of the same product, whatever the case of the name', () => {
    const first = bottle({ id: 1, name: 'Havana 3', remainingPercent: 100 });
    const second = bottle({ id: 2, name: 'havana 3', remainingPercent: 40 });

    const result = groupBottles([first, second]);

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(isGroup(group)).toBe(true);
    if (!isGroup(group)) return;
    expect(group.name).toBe('Havana 3');
    expect(group.bottles).toEqual([first, second]);
  });

  it('keeps the order of the first bottle of each product', () => {
    const rum = bottle({ id: 1, name: 'Rum' });
    const gin = bottle({ id: 2, name: 'Gin' });
    const secondRum = bottle({ id: 3, name: 'Rum' });

    const result = groupBottles([rum, gin, secondRum]);

    expect(result).toHaveLength(2);
    expect(isGroup(result[0])).toBe(true);
    expect(result[1]).toBe(gin);
  });
});
