/**
 * Characters HTML draws as nothing or as a blank, which make two names look the same: 'X\u200BY'
 * (with a zero-width space) shows exactly like 'XY', and 'X\u2800Y' (braille pattern blank) like 'X Y'.
 * So does a name and its decomposed form: 'E\u0300' (E and a combining grave accent) shows like 'È'.
 *
 * The admin screens mark these characters in a stored name, and a typed name is tidied before it is
 * sent, with the same rule in `backend/src/utils/invisibleCharacters.ts`: change both together.
 */

// Unicode's list of the characters a renderer shows as nothing: soft hyphen, zero-width space,
// joiners, word joiner, byte order mark, direction marks and isolates, variation selectors, tags…
// It leaves out the format characters that are drawn (Arabic number signs, Egyptian hieroglyph
// controls) and white space, which the space rules handle.
const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

// Drawn as a blank by fonts, yet not white space for JS: the braille pattern blank, and the Hangul
// fillers, which are in the list above but which most fonts draw as a wide space. They follow the
// space rules (trimmed, reduced to one space, marked as a space), not the invisible ones.
const BLANK_CHARACTERS = String.raw`\u2800\u3164\uFFA0`;
const BLANK = new RegExp(`[${BLANK_CHARACTERS}]`, 'u');

/** A regex class for one character drawn as a space: white space or a blank character. */
export const SPACE_LIKE = String.raw`[\s${BLANK_CHARACTERS}]`;
const SPACE_RUNS = new RegExp(`${SPACE_LIKE}+`, 'gu');

const ZERO_WIDTH_JOINER = '\u200D';
const ZERO_WIDTH_NON_JOINER = '\u200C';
const MONGOLIAN_VOWEL_SEPARATOR = '\u180E';
const VARIATION_SELECTOR = /\p{Variation_Selector}/u;
// Text and emoji presentation selectors: the red heart emoji instead of the text heart.
const PRESENTATION_SELECTOR = /[\uFE0E\uFE0F]/u;
// A digit, '#' or '*' becomes a keycap emoji with an emoji presentation selector and U+20E3.
const KEYCAP_BASE = /[0-9#*]/u;
const COMBINING_KEYCAP = '\u20E3';
// The tags that spell a subdivision flag after the black flag emoji (Scotland, Wales, England).
const TAG = /[\u{E0020}-\u{E007F}]/u;

const EMOJI = /\p{Emoji}/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
// What comes before the joiner inside an emoji sequence: a pictograph, a skin tone, or the
// presentation selector of the pictograph (the rainbow flag).
const EMOJI_BEFORE_JOINER = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

// Only scripts of Unicode 11 or older: a script name a browser does not know is a syntax error, and
// the oldest supported browser (Safari 16.0) has to compile these patterns.
function scriptsPattern(scripts: string[]): RegExp {
  return new RegExp(`[${scripts.map((script) => String.raw`\p{Script_Extensions=${script}}`).join('')}]`, 'u');
}

// Cursive scripts: a joiner or non-joiner between two letters picks the joined or separate form
// (Persian writes some words with a non-joiner).
const CURSIVE_SCRIPTS = [
  'Arabic', 'Syriac', 'Mongolian', 'Nko', 'Mandaic', 'Manichaean', 'Psalter_Pahlavi', 'Phags_Pa',
  'Adlam', 'Hanifi_Rohingya', 'Sogdian',
];
// Brahmic scripts with a virama: a joiner or non-joiner after it picks a conjunct, a half form, a
// chillu or a visible virama (Devanagari, Bengali, Malayalam…).
const VIRAMA_SCRIPTS = [
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam',
  'Sinhala', 'Tibetan', 'Myanmar', 'Khmer', 'Tai_Tham', 'Balinese', 'Javanese', 'Sundanese', 'Batak',
  'Tagalog', 'Hanunoo', 'Rejang', 'Kharoshthi', 'Brahmi', 'Kaithi', 'Chakma', 'Sharada', 'Khojki',
  'Khudawadi', 'Grantha', 'Tirhuta', 'Siddham', 'Modi', 'Takri', 'Ahom', 'Newa', 'Bhaiksuki',
  'Masaram_Gondi', 'Gunjala_Gondi', 'Dogra', 'Soyombo', 'Zanabazar_Square', 'Meetei_Mayek',
  'Saurashtra', 'Syloti_Nagri',
];
// Scripts whose glyph variants a variation selector picks: CJK ideographic variation sequences,
// Mongolian free variation selectors, standardized variants of Phags-pa, Manichaean and Myanmar.
const VARIANT_SCRIPTS = ['Han', 'Mongolian', 'Phags_Pa', 'Manichaean', 'Myanmar'];

const JOINING_SCRIPT = scriptsPattern([...CURSIVE_SCRIPTS, ...VIRAMA_SCRIPTS]);
const VARIANT_SCRIPT = scriptsPattern(VARIANT_SCRIPTS);

type Neighbour = string | undefined;

function isLetterOf(script: RegExp, char: Neighbour): boolean {
  return char !== undefined && LETTER_OR_MARK.test(char) && script.test(char);
}

/**
 * A zero-width joiner joins two emoji into one, or, after a letter of a joining script, picks a
 * joined form whatever follows: a half form or a chillu can end a word.
 */
function keepsJoiner(previous: Neighbour, next: Neighbour): boolean {
  const joinsEmoji = previous !== undefined && EMOJI_BEFORE_JOINER.test(previous)
    && next !== undefined && PICTOGRAPH.test(next);
  return joinsEmoji || isLetterOf(JOINING_SCRIPT, previous);
}

/** A zero-width non-joiner or a Mongolian vowel separator acts between two letters of a joining script. */
function keepsSeparator(previous: Neighbour, next: Neighbour): boolean {
  return isLetterOf(JOINING_SCRIPT, previous) && isLetterOf(JOINING_SCRIPT, next);
}

function keepsVariationSelector(char: string, previous: Neighbour, next: Neighbour): boolean {
  if (previous === undefined) return false;
  if (!PRESENTATION_SELECTOR.test(char)) return isLetterOf(VARIANT_SCRIPT, previous);
  if (KEYCAP_BASE.test(previous)) return next === COMBINING_KEYCAP;
  return EMOJI.test(previous);
}

function keepsTag(previous: Neighbour): boolean {
  return previous !== undefined && (PICTOGRAPH.test(previous) || TAG.test(previous));
}

/** Whether HTML draws nothing for `char`, between the character kept before it and the next one. */
function isInvisible(char: string, previous: Neighbour, next: Neighbour): boolean {
  if (BLANK.test(char) || !DEFAULT_IGNORABLE.test(char)) return false;
  if (VARIATION_SELECTOR.test(char)) return !keepsVariationSelector(char, previous, next);
  if (char === ZERO_WIDTH_JOINER) return !keepsJoiner(previous, next);
  if (char === ZERO_WIDTH_NON_JOINER || char === MONGOLIAN_VOWEL_SEPARATOR) return !keepsSeparator(previous, next);
  if (TAG.test(char)) return !keepsTag(previous);
  return true;
}

/**
 * `text` with each invisible character replaced by `replacement(char)`. A joiner, variation
 * selector or tag that changes how an emoji or a letter is drawn is not invisible, and is kept.
 * Each character is judged after the ones before it.
 */
export function replaceInvisibleCharacters(text: string, replacement: (char: string) => string): string {
  const chars = Array.from(text);
  let previous: Neighbour;
  let result = '';
  chars.forEach((char, index) => {
    if (isInvisible(char, previous, chars[index + 1])) {
      result += replacement(char);
    } else {
      result += char;
      previous = char;
    }
  });
  return result;
}

/**
 * A typed name in the canonical composed form (NFC): Unicode declares 'E\u0300' and 'È' the same
 * text, and renderers draw them alike. Not the compatibility form (NFKC), which changes characters
 * that are drawn differently: the 'ﬁ' ligature, 'CO₂', full-width 'ＶＯＤＫＡ', half-width kana, or
 * Hangul compatibility jamo, which it joins into syllables ('ㄱㅏ' becomes '가').
 */
export function composeName(name: string): string {
  return name.normalize('NFC');
}

/**
 * A typed name as the admin can tell it apart from the others: without invisible characters, in
 * the composed form, without spaces around it, and with every run of spaces inside it reduced to
 * one space. Composed after the invisible characters are removed, which can bring a letter next to
 * its accent ('E\u200B\u0300').
 */
export function tidyName(name: string): string {
  return composeName(replaceInvisibleCharacters(name, () => '')).replace(SPACE_RUNS, ' ').trim();
}
