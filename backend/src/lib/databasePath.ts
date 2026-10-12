import path from 'path';

/**
 * Folder of schema.prisma, the same from src/lib and dist/lib. Prisma 6 resolved
 * a relative SQLite path from there: keeping that base lets existing setups
 * (`file:./carta_cocktail.db` in backend/.env) open the same file.
 */
export const PRISMA_DIR = path.resolve(__dirname, '../../prisma');

/**
 * Absolute path of the SQLite file named by a `file:` DATABASE_URL: URL
 * parameters removed, a relative path resolved from the folder of schema.prisma.
 *
 * The SQLite driver adapter opens the path it is given from the working
 * directory, and the Prisma CLI reads its URL from prisma.config.ts: both get
 * this absolute path, so they always open the same file.
 */
export function resolveDatabasePath(url: string = process.env.DATABASE_URL ?? ''): string {
  if (!url.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file: URL, for example file:./carta_cocktail.db');
  }
  const filePath = url.slice('file:'.length).split('?')[0];
  return path.resolve(PRISMA_DIR, filePath);
}
