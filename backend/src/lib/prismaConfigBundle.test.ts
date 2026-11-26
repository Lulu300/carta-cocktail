import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

// The image has no src/: its Dockerfile bundles prisma.config.ts into dist/lib/.
// This builds the same bundle (same esbuild flags) in a folder without src/.
describe('Prisma CLI config bundled for the image', () => {
  let root: string;
  let bundlePath: string;
  const originalUrl = process.env.DATABASE_URL;

  const loadConfig = (): { datasource?: { url: string } } => {
    const nodeRequire = createRequire(bundlePath);
    delete nodeRequire.cache[bundlePath];
    return nodeRequire(bundlePath).default;
  };

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'carta.')));
    // The bundle keeps `prisma/config` and `dotenv` external, as in the image
    fs.symlinkSync(path.resolve(__dirname, '../../node_modules'), path.join(root, 'node_modules'));
    bundlePath = path.join(root, 'dist/lib/prisma.config.js');
    buildSync({
      entryPoints: [path.resolve(__dirname, '../../prisma.config.ts')],
      bundle: true,
      platform: 'node',
      packages: 'external',
      outfile: bundlePath,
      logLevel: 'silent',
    });
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalUrl;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('should resolve a relative DATABASE_URL from the prisma folder next to dist/', () => {
    process.env.DATABASE_URL = 'file:./x.db';
    expect(loadConfig().datasource?.url).toBe(`file:${path.join(root, 'prisma/x.db')}`);
  });

  it('should drop the URL parameters of an absolute DATABASE_URL', () => {
    process.env.DATABASE_URL = 'file:/abs/x.db?connection_limit=1';
    expect(loadConfig().datasource?.url).toBe('file:/abs/x.db');
  });
});
