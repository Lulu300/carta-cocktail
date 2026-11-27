import js from '@eslint/js';
import globals from 'globals';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// JSX text made only of symbols, digits and emojis ("✕", "▲", "→", "+", "⚠️") needs no translation.
// Setting words.exclude replaces the plugin defaults, so the upper-case constant pattern is kept.
const UNTRANSLATED_WORDS = ['[A-Z_-]+', /^[\p{P}\p{S}\p{N}\p{Emoji}\p{Emoji_Component}\s]+$/u];

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: { 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    // Type-aware rules only run on the app sources, which tsconfig.app.json covers.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // Colors come from the theme tokens (index.css), never from an arbitrary hex value in a class.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/\[#[0-9a-fA-F]{3,8}\]/], TemplateElement[value.raw=/\[#[0-9a-fA-F]{3,8}\]/]`,
          message: 'Use a theme color token, not an arbitrary hex value.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // User-facing text goes through i18n: a literal JSX text is an untranslated string.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/test/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        { mode: 'jsx-text-only', words: { exclude: UNTRANSLATED_WORDS } },
      ],
    },
  },
]);
