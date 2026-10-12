import { describe, it, expect } from 'vitest';
import i18n from './index';
import publicEn from './locales/public/en.json';
import publicFr from './locales/public/fr.json';
import adminEn from './locales/admin/en.json';
import adminFr from './locales/admin/fr.json';

// Uses the real i18next instance: setup.ts only mocks react-i18next.

type Messages = { [key: string]: string | Messages };

/** Dotted path of every message: { a: { b: 'x' } } gives { 'a.b': 'x' }. */
function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string'
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value, `${path}.`) };
  }, {});
}

const BUNDLES = {
  public: { en: flatten(publicEn), fr: flatten(publicFr) },
  admin: { en: flatten(adminEn), fr: flatten(adminFr) },
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Key as the code passes it to t(): plural forms collapse to their base key. */
function callableKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, '');
}

// Source files of the app, read as text, keyed by their path from the project root ("/src/App.tsx").
const rawSources = import.meta.glob<string>(
  ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);
const sources = new Map(
  Object.entries(rawSources).map(([path, source]) => [
    new URL(path, 'file:///src/i18n/').pathname,
    source,
  ]),
);

// Relative static imports and re-exports. `import type` is erased from the build, and
// dynamic import() starts a lazy chunk: neither is part of the first load.
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm;

function resolveImport(fromPath: string, specifier: string): string | undefined {
  const base = new URL(specifier, `file://${fromPath}`).pathname;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((path) =>
    sources.has(path),
  );
}

/** Source files bundled in the first load: those main.tsx reaches through static imports. */
function initialLoadFiles(): string[] {
  const reached = new Set<string>();
  const pending = ['/src/main.tsx'];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (reached.has(path)) continue;
    reached.add(path);
    for (const [, specifier] of sources.get(path)!.matchAll(STATIC_IMPORT)) {
      const imported = resolveImport(path, specifier);
      if (imported) pending.push(imported);
    }
  }
  return [...reached];
}

// Every quoted dotted name ('public.back', "common.close"), whether passed to t() directly or held
// in a constant: a key read through a variable comes from such a literal in an imported file.
const KEY_LITERAL = /['"`]([\w-]+(?:\.[\w-]+)+)['"`]/g;
// A key built at runtime (`colors.${color}`) cannot be checked: the first load must not use one.
const KEY_TEMPLATE = /`[\w-]+(?:\.[\w-]+)*\.\$\{/;

const allKeys = new Set(
  [...Object.keys(BUNDLES.public.en), ...Object.keys(BUNDLES.admin.en)].map(callableKey),
);
const publicKeys = new Set(Object.keys(BUNDLES.public.en).map(callableKey));

function keysUsedBy(files: string[]): Set<string> {
  const literals = files.flatMap((path) =>
    [...sources.get(path)!.matchAll(KEY_LITERAL)].map((match) => match[1]),
  );
  return new Set(literals.filter((literal) => allKeys.has(literal)));
}

describe('locale bundles', () => {
  it.each(Object.entries(BUNDLES))(
    'the %s bundle has the same keys in English and French',
    (_, bundle) => {
      expect(Object.keys(bundle.fr).sort()).toEqual(Object.keys(bundle.en).sort());
    },
  );

  it('never define a key in both bundles', () => {
    const publicEnKeys = Object.keys(BUNDLES.public.en);
    const adminEnKeys = Object.keys(BUNDLES.admin.en);
    // A key in one bundle must not be a namespace in the other either: the deep merge would drop one.
    const clashes = publicEnKeys.filter((key) =>
      adminEnKeys.some(
        (adminKey) =>
          adminKey === key || adminKey.startsWith(`${key}.`) || key.startsWith(`${adminKey}.`),
      ),
    );
    expect(clashes).toEqual([]);
  });
});

describe('public bundle', () => {
  const files = initialLoadFiles();
  const usedKeys = keysUsedBy(files);

  it('follows the static imports of the first load', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        '/src/App.tsx',
        '/src/pages/public/MenuPublicPage.tsx',
        '/src/components/ui/Toaster.tsx',
      ]),
    );
    expect(files).not.toContain('/src/pages/auth/LoginPage.tsx');
    expect(files).not.toContain('/src/components/layout/AdminLayout.tsx');
    expect(files).not.toContain('/src/i18n/admin.ts');
  });

  it('holds every key used by the first load', () => {
    expect([...usedKeys].filter((key) => !publicKeys.has(key))).toEqual([]);
  });

  it('holds only keys used by the first load, the others go in the admin bundle', () => {
    expect([...publicKeys].filter((key) => !usedKeys.has(key))).toEqual([]);
  });

  it('is not read through runtime-built keys in the first load', () => {
    expect(files.filter((path) => KEY_TEMPLATE.test(sources.get(path)!))).toEqual([]);
  });
});

describe('admin bundle registration', () => {
  it('adds the admin messages to the public ones in every language', async () => {
    const adminKeys = Object.keys(BUNDLES.admin.en);
    expect(adminKeys.filter((key) => i18n.exists(key))).toEqual([]);

    await import('./admin');

    for (const language of ['en', 'fr'] as const) {
      for (const bundle of [BUNDLES.public, BUNDLES.admin]) {
        const messages = Object.entries(bundle[language]);
        const missing = messages.filter(
          ([key, value]) => i18n.getResource(language, 'translation', key) !== value,
        );
        expect(missing).toEqual([]);
      }
    }
  });

  it('keeps the English fallback for the admin messages', async () => {
    await import('./admin');
    expect(i18n.t('auth.login', { lng: 'de' })).toBe(BUNDLES.admin.en['auth.login']);
  });
});
