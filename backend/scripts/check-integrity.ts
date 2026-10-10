/**
 * Lists the data problems that block the schema_integrity migration (duplicate
 * category names or unit abbreviations) and the ones to fix by hand (recipe
 * lines without their source, unknown category types...). Read-only.
 *
 * Run it on a copy of the database, never on the live one:
 *   DATABASE_URL=file:/path/to/copy.db npx tsx scripts/check-integrity.ts [--counts-only]
 *
 * --counts-only prints counts without any name read from the database.
 * Exit code: 0 without blocking issue, 1 with blocking issues, 2 on error.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { findIntegrityIssues, formatIntegrityReport, hasBlockingIssues } from '../src/services/integrityService';

// Prisma creates an empty database for a missing file: check the path first.
// Like Prisma, a relative path is resolved from the prisma/ folder.
function databaseFileExists(url = process.env.DATABASE_URL ?? ''): boolean {
  const file = url.replace(/^file:/, '').split('?')[0];
  return file !== '' && fs.existsSync(path.resolve(__dirname, '../prisma', file));
}

async function main(): Promise<number> {
  if (!databaseFileExists()) {
    console.error('Database file not found: set DATABASE_URL=file:/path/to/copy.db');
    return 2;
  }
  const countsOnly = process.argv.includes('--counts-only');
  const issues = await findIntegrityIssues(prisma);
  console.log(formatIntegrityReport(issues, countsOnly));
  return hasBlockingIssues(issues) ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
