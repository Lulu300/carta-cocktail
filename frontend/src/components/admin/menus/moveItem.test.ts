import { describe, it, expect } from 'vitest';
import { moveItem, orderByIds } from './moveItem';

describe('moveItem', () => {
  it('moves an item up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b']);
  });

  it('moves the first item to the end and the last one to the start', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the order when an index is outside the list', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
    expect(moveItem([], 0, 0)).toEqual([]);
  });

  it('never changes the list it receives', () => {
    const list = ['a', 'b'];
    const moved = moveItem(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
    expect(moved).not.toBe(list);
  });
});

describe('orderByIds', () => {
  const items = [{ id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 2 }];

  it('puts the items in the order of the ids and renumbers their positions', () => {
    expect(orderByIds(items, [3, 1, 2])).toEqual([{ id: 3, position: 0 }, { id: 1, position: 1 }, { id: 2, position: 2 }]);
  });

  it('leaves out an item missing from the ids', () => {
    expect(orderByIds(items, [2])).toEqual([{ id: 2, position: 0 }]);
  });
});
