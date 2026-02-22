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
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
      exclude: [
        'src/test/**',
        'dist/**',
        '*.config.*',
        'src/index.ts',
      ],
    },
  },
});
