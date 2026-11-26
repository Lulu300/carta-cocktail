import { describe, expect, it } from 'vitest';
import { parseTags } from './parseTags';

describe('parseTags', () => {
  it.each([
    [null, []],
    [undefined, []],
    ['', []],
    ['  ,  , ', []],
    [' rum ,mint,,  tiki ', ['rum', 'mint', 'tiki']],
  ])('parses %j', (tags, expected) => {
    expect(parseTags(tags)).toEqual(expected);
  });
});
