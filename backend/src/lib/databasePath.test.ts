import { describe, it, expect } from 'vitest';
import path from 'path';
import { TEST_DATABASE_PATH } from '../test/testDatabase';
import { PRISMA_DIR, resolveDatabasePath } from './databasePath';

describe('PRISMA_DIR', () => {
  it('should be the folder of schema.prisma', () => {
    expect(PRISMA_DIR).toBe(path.resolve(__dirname, '../../prisma'));
  });
});

describe('resolveDatabasePath', () => {
  it('should resolve a relative path from the folder of schema.prisma', () => {
    expect(resolveDatabasePath('file:./x.db')).toBe(path.join(PRISMA_DIR, 'x.db'));
  });

  it('should resolve a relative path without ./ the same way', () => {
    expect(resolveDatabasePath('file:x.db')).toBe(path.join(PRISMA_DIR, 'x.db'));
  });

  it('should keep an absolute path', () => {
    expect(resolveDatabasePath('file:/abs/x.db')).toBe(path.resolve('/abs/x.db'));
  });

  it('should drop the URL parameters of a relative path', () => {
    expect(resolveDatabasePath('file:./x.db?connection_limit=1')).toBe(path.join(PRISMA_DIR, 'x.db'));
  });

  it('should drop the URL parameters of an absolute path', () => {
    expect(resolveDatabasePath('file:/abs/x.db?socket_timeout=10')).toBe(path.resolve('/abs/x.db'));
  });

  it('should not depend on the working directory', () => {
    const cwd = process.cwd();
    try {
      process.chdir(path.parse(cwd).root);
      expect(resolveDatabasePath('file:./x.db')).toBe(path.join(PRISMA_DIR, 'x.db'));
    } finally {
      process.chdir(cwd);
    }
  });

  it('should read DATABASE_URL by default', () => {
    // src/test/setup.ts sets DATABASE_URL to the relative URL of the test database
    expect(resolveDatabasePath()).toBe(TEST_DATABASE_PATH);
  });

  it('should refuse a URL that is not a SQLite file', () => {
    expect(() => resolveDatabasePath('postgresql://localhost/carta')).toThrow('file:');
  });

  it('should refuse an empty URL', () => {
    expect(() => resolveDatabasePath('')).toThrow('DATABASE_URL');
  });
});
