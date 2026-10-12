// Configuration of the Prisma CLI (generate, migrate, db push, db seed).
// Prisma 7 no longer reads .env by itself.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDatabasePath } from './src/lib/databasePath';

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Development only (`prisma db seed`): the image has no tsx and runs node dist/scripts/seed.js
    seed: 'tsx src/scripts/seed.ts',
  },
  // `prisma generate` runs without a database (image build, CI): the commands
  // that need one fail with Prisma's own error when DATABASE_URL is missing.
  // The absolute path is the file the application opens (src/lib/prisma.ts).
  datasource: databaseUrl ? { url: `file:${resolveDatabasePath(databaseUrl)}` } : undefined,
});
