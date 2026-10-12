import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: '.',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    // Creates the test database once per run; setup.ts runs in every test file
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      // List every source file, even those no test imports, so untested code
      // counts as 0% instead of disappearing from the report.
      // Keep `exclude` in sync with the delta coverage `--ignore` flags in ci.yml.
      include: ['src/**/*.ts'],
      // Ratchet: each threshold is the measured coverage rounded down (B-10).
      // Raise them when coverage goes up; never lower them.
      thresholds: {
        lines: 97,
        functions: 99,
        branches: 85,
        statements: 96,
      },
      exclude: [
        'src/test/**',
        'dist/**',
        '*.config.*',
        'src/index.ts',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
      ],
    },
  },
});
