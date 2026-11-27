import { describe, it, expect, vi } from 'vitest';
import i18n from './index';
import type { i18n as I18n } from 'i18next';

// Uses the real i18next instance, which setup.ts loads with both bundles.

type Messages = { [key: string]: string | Messages };

// The message files as written: i18next merges the admin messages into the very objects the app
// imports from the public files, and setup.ts registers them, so the JSON modules are no longer
// the bundles on their own.
const messageFiles = import.meta.glob<string>('./locales/*/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function readMessages(bundle: 'public' | 'admin', language: 'en' | 'fr'): Messages {
  return JSON.parse(messageFiles[`./locales/${bundle}/${language}.json`]!);
}

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
  public: { en: flatten(readMessages('public', 'en')), fr: flatten(readMessages('public', 'fr')) },
  admin: { en: flatten(readMessages('admin', 'en')), fr: flatten(readMessages('admin', 'fr')) },
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
      const imported = resolveImport(path, specifier!);
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
    [...sources.get(path)!.matchAll(KEY_LITERAL)].map((match) => match[1]!),
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

  it.each(Object.entries(BUNDLES))(
    'every plural form of the %s bundle has its pair',
    (_, bundle) => {
      // French and English both need _one and _other; i18next falls back to the key itself without them.
      for (const messages of Object.values(bundle)) {
        const keys = Object.keys(messages);
        const orphans = keys.filter(
          (key) =>
            (key.endsWith('_one') && !keys.includes(key.replace(/_one$/, '_other'))) ||
            (key.endsWith('_other') && !keys.includes(key.replace(/_other$/, '_one'))),
        );
        expect(orphans).toEqual([]);
      }
    },
  );

  it.each(Object.entries(BUNDLES))(
    'the %s bundle writes no plural inside a message, such as "bottle(s)"',
    (_, bundle) => {
      // A letter right before the parenthesis: "(ml)" and "Name (brand)" are not plurals.
      const WRITTEN_PLURAL = /\p{L}\([\p{L}/]+\)/u;
      for (const messages of Object.values(bundle)) {
        const offenders = Object.entries(messages)
          .filter(([, message]) => WRITTEN_PLURAL.test(message))
          .map(([key]) => key);
        expect(offenders).toEqual([]);
      }
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
    // A page load: a fresh instance, which only knows the public messages until ./admin runs.
    vi.resetModules();
    const i18n: I18n = (await import('./index')).default;
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

  it('keeps the English fallback for the admin messages', () => {
    expect(i18n.t('auth.login', { lng: 'de' })).toBe(BUNDLES.admin.en['auth.login']);
  });
});

describe('messages', () => {
  const languages = Object.entries(BUNDLES).flatMap(([name, bundle]) =>
    Object.entries(bundle).map(([language, messages]) => ({
      name: `${name}/${language}`,
      messages,
    })),
  );

  it.each(languages)('$name gives every "_one" plural form its "_other" form', ({ messages }) => {
    const orphans = Object.keys(messages)
      .filter((key) => key.endsWith('_one'))
      .filter((key) => !(key.replace(/_one$/, '_other') in messages));
    expect(orphans).toEqual([]);
  });

  it.each(languages)('$name has no empty message', ({ messages }) => {
    const empty = Object.entries(messages).filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });
});

describe('translation keys used in the code', () => {
  /** Every t('literal.key') call: unlike KEY_LITERAL, it also catches a key missing from both bundles. */
  function literalKeys(source: string): string[] {
    return [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((match) => match[1]!);
  }

  /** Every t(`template.${value}`) call, as the text between the backticks. */
  function keyTemplates(source: string): string[] {
    return [...source.matchAll(/\bt\(\s*`([^`]*)`/g)].map((match) => match[1]!);
  }

  // Keys built at runtime from a value the code controls (a nav item, a color, an entity type...).
  // A new one is added here once its keys exist in both languages.
  const KEY_TEMPLATES = [
    'nav.${item.key}',
    'colors.${color}',
    'ingredients.filter.${status}',
    'menus.sections.confirmDelete.${itemLabel}',
    'menus.sections.empty.${itemLabel}',
    'cocktails.importWizard.${type}',
    '${type}.name',
    'bottles.importWizard.rowErrors.source.${source}',
    'validation.fields.${field}',
    'validation.codes.${code}',
    'validation.unresolved.${kind}',
  ];

  /** "colors.${color}" matches "colors.blue": each placeholder stands for one key segment. */
  function templatePattern(template: string): RegExp {
    const parts = template.split(/\$\{[^}]+\}/).map((part) => part.replaceAll('.', '\\.'));
    return new RegExp(`^${parts.join('[^.]+')}$`);
  }

  it('finds the t() calls of the source files', () => {
    expect([...sources.values()].flatMap(literalKeys).length).toBeGreaterThan(300);
  });

  it('all exist in a bundle', () => {
    const missing = [...sources].flatMap(([path, source]) =>
      literalKeys(source)
        .filter((key) => !allKeys.has(key))
        .map((key) => `${path}: ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('are only built at runtime from a listed template', () => {
    const unlisted = [...sources].flatMap(([path, source]) =>
      keyTemplates(source)
        .filter((template) => !KEY_TEMPLATES.includes(template))
        .map((template) => `${path}: ${template}`),
    );
    expect(unlisted).toEqual([]);
  });

  it('only list templates that match existing keys', () => {
    const unmatched = KEY_TEMPLATES.filter(
      (template) => ![...allKeys].some((key) => templatePattern(template).test(key)),
    );
    expect(unmatched).toEqual([]);
  });
});

describe('plural forms', () => {
  it('count bottles and cocktails in English', () => {
    const t = i18n.getFixedT('en');
    expect(t('menus.bottleCount', { count: 1 })).toBe('1 bottle');
    expect(t('menus.bottleCount', { count: 2 })).toBe('2 bottles');
    expect(t('menus.cocktailCount', { count: 1 })).toBe('1 cocktail');
    expect(t('menus.cocktailCount', { count: 0 })).toBe('0 cocktails');
  });

  it('count bottles and cocktails in French, where 0 is singular', () => {
    const t = i18n.getFixedT('fr');
    expect(t('menus.bottleCount', { count: 0 })).toBe('0 bouteille');
    expect(t('menus.bottleCount', { count: 1 })).toBe('1 bouteille');
    expect(t('menus.bottleCount', { count: 2 })).toBe('2 bouteilles');
    expect(t('menus.cocktailCount', { count: 1 })).toBe('1 cocktail');
  });

  it('show unlimited servings with the plural form', () => {
    const t = i18n.getFixedT('fr');
    expect(t('cocktails.doses', { count: 1, servings: 1 })).toBe('1 dose');
    expect(t('cocktails.doses', { count: 999, servings: '∞' })).toBe('∞ doses');
  });
});

describe('plural forms of the import wizards and selections', () => {
  it('count imported bottles in French, where 0 is singular', () => {
    const t = i18n.getFixedT('fr');
    const key = 'bottles.importWizard.successCount';
    expect(t(key, { count: 0 })).toBe('0 bouteille importée');
    expect(t(key, { count: 1 })).toBe('1 bouteille importée');
    expect(t(key, { count: 2 })).toBe('2 bouteilles importées');
  });

  it('count imported bottles in English', () => {
    const t = i18n.getFixedT('en');
    const key = 'bottles.importWizard.successCount';
    expect(t(key, { count: 1 })).toBe('1 bottle imported');
    expect(t(key, { count: 2 })).toBe('2 bottles imported');
  });

  it('agree the batch summary with the number of imported recipes', () => {
    const t = i18n.getFixedT('fr');
    const key = 'cocktails.importWizard.batchSummaryCount';
    expect(t(key, { count: 1, success: 1, total: 3 })).toBe('1 sur 3 importé avec succès');
    expect(t(key, { count: 2, success: 2, total: 3 })).toBe('2 sur 3 importés avec succès');
  });

  it('agree the selection count in French', () => {
    const t = i18n.getFixedT('fr');
    expect(t('common.selected', { count: 1 })).toBe('1 sélectionné');
    expect(t('common.selected', { count: 3 })).toBe('3 sélectionnés');
  });
});

describe('number formats', () => {
  // Intl may separate French thousands with a narrow no-break space.
  const normalizeSpaces = (text: string) => text.replace(/\s/g, ' ');

  it('write quantities the French way', () => {
    const t = i18n.getFixedT('fr');
    expect(normalizeSpaces(t('units.ml', { value: 0.6 }))).toBe('0,6 ml');
    expect(normalizeSpaces(t('units.abv', { value: 40.5 }))).toBe('40,5 % vol.');
  });

  it('write quantities the English way', () => {
    const t = i18n.getFixedT('en');
    expect(t('units.ml', { value: 1500 })).toBe('1,500 ml');
    expect(t('units.abv', { value: 40.5 })).toBe('40.5% vol.');
  });
});
