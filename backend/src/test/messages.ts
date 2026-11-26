// Helpers shared by the tests that read the translation files (src/i18n/*.test.ts)

export type Messages = { [key: string]: string | Messages };

const PLACEHOLDER = /{{\s*(\w+)/g;

/** The message at a dotted key such as `errors.import.invalidZip`, or undefined. */
export function messageAt(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

/** The sorted names of the `{{placeholders}}` of a message. */
export function placeholders(message: string): string[] {
  return [...message.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}
