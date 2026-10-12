import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    css: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      // List every source file, even those no test imports, so untested code
      // counts as 0% instead of disappearing from the report.
      // Keep `exclude` in sync with the delta coverage `--ignore` flags in ci.yml.
      include: ['src/**/*.{ts,tsx}'],
      // Ratchet: each threshold is the measured coverage rounded down (B-10).
      // Raise them when coverage goes up; never lower them.
      thresholds: {
        lines: 74,
        functions: 70,
        branches: 63,
        statements: 73,
      },
      exclude: [
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/i18n/**',
        '*.config.*',
        'src/**/*.test.{ts,tsx}',
        'src/types/**',
      ],
    },
  },
});
