import { execSync } from 'child_process';
import path from 'path';
import { TEST_DATABASE_URL, removeTestDatabaseFiles } from './testDatabase';

/**
 * Creates the test database once for the whole run, in Vitest's main process.
 * Test files share it and empty it with cleanDatabase() between tests.
 */
export function setup(): void {
  removeTestDatabaseFiles();
  execSync('npx prisma db push --force-reset', {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      // Prisma refuses --force-reset when it detects an AI agent without this consent
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes',
    },
    stdio: 'pipe',
  });
}

export function teardown(): void {
  removeTestDatabaseFiles();
}
