import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData } from './test/helpers';
import { TEST_DATABASE_URL } from './test/testDatabase';

// scripts/check-integrity.ts runs as UPGRADING.md documents it: in its own process

const BACKEND_DIR = path.resolve(__dirname, '..');
const TSX = path.join(BACKEND_DIR, 'node_modules', '.bin', 'tsx');

function runScript(databaseUrl: string | undefined) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return spawnSync(TSX, ['scripts/check-integrity.ts', '--counts-only'], { cwd: BACKEND_DIR, env, encoding: 'utf8' });
}

describe('scripts/check-integrity.ts', () => {
  beforeAll(async () => { await setupTestDatabase(); });
  afterAll(async () => { await teardownTestDatabase(); });
  beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

  it('should exit with 2 and say so when DATABASE_URL is not set', () => {
    const result = runScript(undefined);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Database file not found: set DATABASE_URL=');
  });

  it('should exit with 2 when the database file does not exist', () => {
    const result = runScript(`file:${path.join(BACKEND_DIR, 'prisma', 'missing-copy.db')}`);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Database file not found');
  });

  it('should exit with 0 on a database without blocking issue', () => {
    const result = runScript(TEST_DATABASE_URL);

    expect(result.status).toBe(0);
  });
});
