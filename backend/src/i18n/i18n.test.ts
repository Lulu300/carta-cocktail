import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import en from './en.json';
import fr from './fr.json';
import i18next from '.';

const SRC_DIR = path.resolve(__dirname, '..');
// The Prisma client is generated code: it holds no message key
const SKIPPED_DIRS = new Set(['generated']);

/** How the code names a message key: `prefix` + the captured text. */
const KEY_PATTERNS: { pattern: RegExp; prefix: string }[] = [
  // req.t('menus.deleted'), t('…')
  { pattern: /\bt\(\s*['"`]([\w.]+)['"`]/g, prefix: '' },
  // new ForbiddenError('errors.cannotDeleteDefaultMenu')
  { pattern: /new (?!ImportParseError\b)\w+Error\(\s*['"`]([\w.]+)['"`]/g, prefix: '' },
  // Keys passed around before they are thrown: new HttpError(429, 'errors.…'), default parameters…
  { pattern: /['"`](errors\.[\w.]+)['"`]/g, prefix: '' },
  // new ImportParseError('invalidZip'): the bottles route answers `errors.import.<code>`
  { pattern: /new ImportParseError\(\s*['"`](\w+)['"`]/g, prefix: 'errors.import.' },
];

const PLACEHOLDER = /{{\s*(\w+)/g;

type Messages = { [key: string]: string | Messages };

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(fullPath);
    const isSource = entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts');
    return isSource ? [fullPath] : [];
  });
}

/** Every dotted path to a message, e.g. `errors.import.invalidZip`. */
function flattenKeys(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([name, value]) => {
    const key = prefix + name;
    return typeof value === 'string' ? [key] : flattenKeys(value, `${key}.`);
  });
}

function messageAt(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

/** `file: key` for every key a source file uses. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sourceFiles(SRC_DIR)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const { pattern, prefix } of KEY_PATTERNS) {
      for (const match of code.matchAll(pattern)) {
        const key = prefix + match[1];
        keys.set(`${path.relative(SRC_DIR, file)}: ${key}`, key);
      }
    }
  }
  return keys;
}

describe('backend translations', () => {
  const enKeys = flattenKeys(en);
  const frKeys = flattenKeys(fr);

  it('finds the keys used by the routes and services', () => {
    // Guards the extraction itself: a broken pattern would make the next test pass on nothing
    const keys = [...usedKeys().values()];
    expect(keys).toContain('menus.deleted');
    expect(keys).toContain('errors.cannotDeleteDefaultMenu');
    expect(keys).toContain('errors.inUseByCocktails');
    expect(keys).toContain('errors.import.invalidZip');
  });

  it('defines every key used in the code, in English and in French', () => {
    const missing = [...usedKeys()]
      .filter(([, key]) => messageAt(en, key) === undefined || messageAt(fr, key) === undefined)
      .map(([usage]) => usage);
    expect(missing).toEqual([]);
  });

  it('has the same keys in English and in French', () => {
    expect(frKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !frKeys.includes(key))).toEqual([]);
  });

  it('uses the same placeholders in English and in French', () => {
    const different = enKeys.filter((key) => {
      const french = messageAt(fr, key);
      return french !== undefined && placeholders(messageAt(en, key)!).join() !== placeholders(french).join();
    });
    expect(different).toEqual([]);
  });

  it('does not HTML-escape interpolated values: the messages go out as JSON', () => {
    const message = i18next.t('test.unknownKey', { defaultValue: 'Name: {{name}}', replace: { name: 'Gin & <Tonic>' } });
    expect(message).toBe('Name: Gin & <Tonic>');
  });

  it('never answers an untranslated error from a route or a middleware', () => {
    const literalError = /error:\s*['"`]/;
    const offenders = ['routes', 'middleware']
      .flatMap((dir) => sourceFiles(path.join(SRC_DIR, dir)))
      .filter((file) => literalError.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });
});
