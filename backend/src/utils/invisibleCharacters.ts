/**
 * Characters HTML draws as nothing, which make two names look the same: 'X\u200BY' (with a
 * zero-width space) shows exactly like 'XY'.
 *
 * A new category type name is stored without them; the admin screens mark them in a stored name,
 * with the same rule in `frontend/src/utils/invisibleCharacters.ts`: change both together.
 */

// Unicode's list of the characters a renderer shows as nothing: soft hyphen, zero-width space,
// joiners, word joiner, byte order mark, direction marks and isolates, Hangul fillers, variation
// selectors, tags… It leaves out the format characters that are drawn (Arabic number signs,
// Egyptian hieroglyph controls) and white space, which the space rules handle.
const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

// These change how the characters next to them are drawn, so they are kept where they do.
const VARIATION_SELECTOR = /\p{Variation_Selector}/u;
// Zero-width non-joiner and joiner, Mongolian vowel separator.
const SHAPING_CONTROL = /\p{Join_Control}|\u180E/u;
// The tags that spell a subdivision flag after the black flag emoji (Scotland, Wales, England).
const TAG = /[\u{E0020}-\u{E007F}]/u;

// Letters of the scripts that neither join, form conjuncts nor have glyph variants: next to them,
// the characters above change nothing.
const PLAIN_LETTER = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
// What a joiner joins: emoji (woman + ZWJ + laptop is one emoji, and so is the rainbow flag, whose
// variation selector is a mark), and the letters and marks of the other scripts (Persian writes some
// words with a zero-width non-joiner, Devanagari forms some conjuncts with a zero-width joiner).
const JOINABLE = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{L}\p{M}]/u;
// What a variation selector varies: emoji (the red heart emoji instead of the text heart, keycaps),
// and the letters of the other scripts (CJK ideograph variants, Mongolian).
const VARIABLE = /[\p{Emoji}\p{L}]/u;
const EMOJI = /\p{Emoji}/u;

function actsOn(char: string | undefined, kind: RegExp): boolean {
  return char !== undefined && kind.test(char) && !PLAIN_LETTER.test(char);
}

function joins(previous: string | undefined, next: string | undefined): boolean {
  // An invisible next character is removed too (a Hangul filler is a letter): the joiner would join nothing
  if (next === undefined || DEFAULT_IGNORABLE.test(next)) return false;
  return actsOn(previous, JOINABLE) && actsOn(next, JOINABLE);
}

function isTagged(previous: string | undefined): boolean {
  return previous !== undefined && (EMOJI.test(previous) || TAG.test(previous));
}

/** Whether HTML draws nothing for `char`, between the character kept before it and the next one. */
function isInvisible(char: string, previous: string | undefined, next: string | undefined): boolean {
  if (!DEFAULT_IGNORABLE.test(char)) return false;
  if (VARIATION_SELECTOR.test(char)) return !actsOn(previous, VARIABLE);
  if (SHAPING_CONTROL.test(char)) return !joins(previous, next);
  if (TAG.test(char)) return !isTagged(previous);
  return true;
}

/**
 * `text` with each invisible character replaced by `replacement(char)`. A joiner, variation
 * selector or tag that changes how an emoji or a letter of a joining script is drawn is not
 * invisible, and is kept. Each character is judged after the ones before it.
 */
export function replaceInvisibleCharacters(text: string, replacement: (char: string) => string): string {
  const chars = Array.from(text);
  let previous: string | undefined;
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
