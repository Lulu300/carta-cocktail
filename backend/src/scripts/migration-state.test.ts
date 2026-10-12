import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TEST_DATABASE_URL } from '../test/testDatabase';

// The script runs as docker-entrypoint.sh runs it: in its own process

const BACKEND_DIR = path.resolve(__dirname, '../..');
const TSX = path.join(BACKEND_DIR, 'node_modules', '.bin', 'tsx');

function runScript(databaseUrl: string | undefined) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return spawnSync(TSX, ['src/scripts/migration-state.ts'], { cwd: BACKEND_DIR, env, encoding: 'utf8' });
}

describe('src/scripts/migration-state.ts', () => {
  it('should exit with 2 when DATABASE_URL is not set', () => {
    const result = runScript(undefined);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Database file not found: set DATABASE_URL=');
  });

  it('should exit with 2 without creating a missing database file', () => {
    const missing = path.join(BACKEND_DIR, 'prisma', 'missing-state.db');

    const result = runScript(`file:${missing}`);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Database file not found');
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('should exit with 2 and one line when the file is not a database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-state-'));
    const file = path.join(dir, 'not-a-database.db');
    fs.writeFileSync(file, 'not a database');
    try {
      const result = runScript(`file:${file}`);

      expect(result.status).toBe(2);
      expect(result.stderr.trim()).toBe(
        'Cannot read the migration history: Raw query failed. Code: `SQLITE_NOTADB`. Message: `file is not a database`',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should list every migration of the repository as to apply on the test database (db push, no history)', () => {
    const result = runScript(TEST_DATABASE_URL);

    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines[0]).toBe('unapplied 0_init');
    expect(lines).toContain('unapplied 20261010173910_schema_integrity');
    expect(lines.some((line) => line.startsWith('failed '))).toBe(false);
  });
});
