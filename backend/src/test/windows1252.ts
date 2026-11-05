// The Windows-1252 bytes of the accented characters the import tests use. œ and € sit in
// 0x80-0x9F, where Windows-1252 differs from Latin-1: a Latin-1 decoder would get them wrong.
const WINDOWS_1252_BYTES: Record<string, number> = {
  à: 0xe0,
  è: 0xe8,
  é: 0xe9,
  œ: 0x9c,
  '€': 0x80,
};

function windows1252Byte(char: string): number {
  if (char in WINDOWS_1252_BYTES) return WINDOWS_1252_BYTES[char];
  const code = char.charCodeAt(0);
  if (code >= 0x80) throw new Error(`windows1252Bytes: add the byte of "${char}" to the table`);
  return code;
}

/** The bytes Excel writes for `text` in its "CSV (séparateur : point-virgule)" format: Windows-1252, no BOM. */
export function windows1252Bytes(text: string): Buffer {
  return Buffer.from(Array.from(text, windows1252Byte));
}
