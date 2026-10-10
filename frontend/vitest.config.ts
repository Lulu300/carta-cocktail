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
      thresholds: {
        lines: 60,
        // Ratchet: set to the coverage measured once untested files entered the
        // report (B-02). Never lower these; task B-10 raises them back to 60.
        functions: 53,
        branches: 52,
        statements: 60,
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
