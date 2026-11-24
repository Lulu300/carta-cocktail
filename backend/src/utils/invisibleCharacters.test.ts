import { describe, it, expect } from 'vitest';
import { replaceInvisibleCharacters } from './invisibleCharacters';

// Same cases as frontend/src/utils/invisibleCharacters.test.ts: both packages apply one rule.
function removeInvisible(text: string): string {
  return replaceInvisibleCharacters(text, () => '');
}

describe('replaceInvisibleCharacters', () => {
  it.each([
    ['zero-width space', '\u200B'],
    ['word joiner', '\u2060'],
    ['soft hyphen', '\u00AD'],
    ['byte order mark', '\uFEFF'],
    ['invisible plus', '\u2064'],
    ['left-to-right mark', '\u200E'],
    ['right-to-left mark', '\u200F'],
    ['Arabic letter mark', '\u061C'],
    ['left-to-right embedding', '\u202A'],
    ['right-to-left override', '\u202E'],
    ['left-to-right isolate', '\u2066'],
    ['pop directional isolate', '\u2069'],
    ['combining grapheme joiner', '\u034F'],
    ['Hangul filler', '\u3164'],
    ['Mongolian vowel separator between Latin letters', '\u180E'],
    ['zero-width non-joiner between Latin letters', '\u200C'],
    ['zero-width joiner between Latin letters', '\u200D'],
    ['variation selector after a Latin letter', '\uFE0F'],
    ['tag after a Latin letter', '\u{E0067}\u{E0062}'],
    ['language tag', '\u{E0001}'],
  ])('should find the %s invisible', (_name, invisible) => {
    expect(removeInvisible(`X${invisible}Y`)).toBe('XY');
  });

  it.each([
    ['accented Latin letters', 'CRÈME DE CASSIS'],
    ['Greek and Cyrillic letters', 'ΟΥΖΟ ДЖИН'],
    ['CJK ideographs', '梅酒'],
    ['Persian with its zero-width non-joiner', 'می\u200Cخواهم'],
    ['Devanagari with its zero-width joiner', 'क्\u200Dष'],
    ['an emoji ZWJ sequence', '👩\u200D💻'],
    ['an emoji ZWJ sequence with a variation selector', '🏳\uFE0F\u200D🌈'],
    ['an emoji ZWJ sequence with a skin tone', '👩\u{1F3FD}\u200D💻'],
    ['an emoji variation selector', '❤\uFE0F'],
    ['a keycap', '1\uFE0F\u20E3'],
    ['a subdivision flag', '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'],
    ['an ideographic variation sequence', '葛\u{E0100}'],
    ['a visible format character', '\u0600١٢'],
    ['spaces', ' X  Y\t'],
  ])('should keep %s', (_name, text) => {
    expect(removeInvisible(text)).toBe(text);
  });

  it.each([
    ['a joiner at the end', '🍹\u200D', '🍹'],
    ['a joiner between an emoji and a Latin letter', '🍹\u200DX', '🍹X'],
    ['a joiner before a Hangul filler', 'ی\u200C\u3164', 'ی'],
    ['a second variation selector', '❤\uFE0F\uFE0F', '❤\uFE0F'],
    ['the first of two joiners', '👩\u200D\u200D💻', '👩\u200D💻'],
  ])('should judge each character by its neighbours: %s', (_name, text, expected) => {
    expect(removeInvisible(text)).toBe(expected);
  });

  it('should replace each invisible character with the replacement of that character', () => {
    const codePoint = (char: string) => `<${char.codePointAt(0)?.toString(16)}>`;
    expect(replaceInvisibleCharacters('\u200BX\u00ADY\u{E0001}', codePoint)).toBe('<200b>X<ad>Y<e0001>');
  });
});
