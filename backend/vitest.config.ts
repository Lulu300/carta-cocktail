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
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
      exclude: [
        'src/test/**',
        // Prisma client: generated, not versioned, so never in the ci.yml delta
        'src/generated/**',
        'dist/**',
        '*.config.*',
        'src/index.ts',
        // Entry points of their own process (seed, integrity check), like src/index.ts
        'src/scripts/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
      ],
    },
  },
});
