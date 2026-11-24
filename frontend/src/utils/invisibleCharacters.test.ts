import { describe, it, expect } from 'vitest';
import { replaceInvisibleCharacters, tidyName } from './invisibleCharacters';

// Same cases as backend/src/utils/invisibleCharacters.test.ts: both packages apply one rule.
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
    ['Mongolian vowel separator between Latin letters', '\u180E'],
    ['zero-width non-joiner between Latin letters', '\u200C'],
    ['zero-width joiner between Latin letters', '\u200D'],
    ['variation selector after a Latin letter', '\uFE0F'],
    ['ideographic variation selector after a Latin letter', '\u{E0100}'],
    ['tag after a Latin letter', '\u{E0067}\u{E0062}'],
    ['language tag', '\u{E0001}'],
  ])('should find the %s invisible', (_name, invisible) => {
    expect(removeInvisible(`X${invisible}Y`)).toBe('XY');
  });

  // These scripts neither join their letters nor form conjuncts: a joiner changes nothing
  it.each([
    ['CJK ideographs', '梅', '酒'],
    ['kana', 'さけ', 'さけ'],
    ['Hangul', '술', '술'],
    ['Hebrew', 'יין', 'יין'],
    ['Thai', 'เหล\u0E49า', 'เหล\u0E49า'],
    ['Armenian', 'գինի', 'գինի'],
  ])('should find a joiner or non-joiner between %s invisible', (_name, before, after) => {
    expect(removeInvisible(`${before}\u200D${after}`)).toBe(`${before}${after}`);
    expect(removeInvisible(`${before}\u200C${after}`)).toBe(`${before}${after}`);
  });

  it.each([
    ['after a Hebrew letter', 'י\uFE0E', 'י'],
    ['after a CJK ideograph', '梅\uFE0F', '梅'],
    ['after a digit that is not a keycap', 'RUM1\uFE0F', 'RUM1'],
    ['an ideographic selector after a Hebrew letter', 'י\u{E0100}', 'י'],
  ])('should find a variation selector %s invisible', (_name, text, expected) => {
    expect(removeInvisible(text)).toBe(expected);
  });

  it.each([
    ['accented Latin letters', 'CRÈME DE CASSIS'],
    ['Greek and Cyrillic letters', 'ΟΥΖΟ ДЖИН'],
    ['CJK ideographs', '梅酒'],
    ['Persian with its zero-width non-joiner', 'می\u200Cخواهم'],
    ['a Devanagari conjunct with its zero-width joiner', 'क\u094D\u200Dष'],
    ['a Devanagari half form at the end of a word', 'क\u094D\u200D'],
    ['a Malayalam chillu written with a zero-width joiner', 'ന\u0D4D\u200D'],
    ['a forced Arabic joining form', 'ه\u200D'],
    ['an emoji ZWJ sequence', '👩\u200D💻'],
    ['an emoji ZWJ sequence with a variation selector', '🏳\uFE0F\u200D🌈'],
    ['an emoji ZWJ sequence with a skin tone', '👩\u{1F3FD}\u200D💻'],
    ['an emoji variation selector', '❤\uFE0F'],
    ['a text variation selector', '❤\uFE0E'],
    ['a digit keycap', '1\uFE0F\u20E3'],
    ['a hash keycap', '#\uFE0F\u20E3'],
    ['a subdivision flag', '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'],
    ['an ideographic variation sequence', '葛\u{E0100}'],
    ['a Mongolian free variation selector', 'ᠠ\u180B'],
    ['a visible format character', '\u0600١٢'],
    ['spaces', ' X  Y\t'],
    ['characters drawn as a blank', 'X\u2800Y\u3164\uFFA0'],
  ])('should keep %s', (_name, text) => {
    expect(removeInvisible(text)).toBe(text);
  });

  it.each([
    ['a joiner at the end of an emoji', '🍹\u200D', '🍹'],
    ['a joiner between an emoji and a Latin letter', '🍹\u200DX', '🍹X'],
    ['a Persian non-joiner at the end of a word', 'می\u200C', 'می'],
    ['a non-joiner before an invisible character', 'ی\u200C\u200B', 'ی'],
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

describe('tidyName', () => {
  it.each([
    ['JUICE', 'JUICE'],
    [' FRUIT \t\n JUICE ', 'FRUIT JUICE'],
    ['\u200B X \u200B Y \u200E', 'X Y'],
    ['X\uFEFFY', 'XY'],
    ['X\u2800Y', 'X Y'],
    ['\u2800SPIRIT\u3164', 'SPIRIT'],
    ['X \u2800\uFFA0 Y', 'X Y'],
    ['\u2800\u200B \u3164', ''],
    ['梅\u200D酒', '梅酒'],
    ['می\u200Cخواهم', 'می\u200Cخواهم'],
  ])('should tidy %j as %j', (name, expected) => {
    expect(tidyName(name)).toBe(expected);
  });
});
