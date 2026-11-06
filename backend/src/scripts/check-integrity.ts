/**
 * Lists the data problems that block the schema_integrity migration (duplicate
 * category names or unit abbreviations) and the ones to fix by hand (recipe
 * lines without their source, unknown category types...). Read-only.
 *
 * Run it on a copy of the database, never on the live one:
 *   DATABASE_URL=file:/path/to/copy.db npx tsx src/scripts/check-integrity.ts [--counts-only]
 * The Docker image holds the compiled script only:
 *   node dist/scripts/check-integrity.js [--counts-only]
 *
 * --counts-only prints counts without any name read from the database.
 * Exit code: 0 without blocking issue, 1 with blocking issues, 2 on error.
 */
import { databaseFileExists } from '../lib/databasePath';

async function main(): Promise<number> {
  if (!databaseFileExists()) {
    console.error('Database file not found: set DATABASE_URL=file:/path/to/copy.db');
    return 2;
  }
  // Loaded after the check: the shared client resolves DATABASE_URL when it is
  // imported, and would fail with a stack trace instead of this exit code.
  const { prisma } = await import('../lib/prisma');
  const { findIntegrityIssues, formatIntegrityReport, hasBlockingIssues } = await import(
    '../services/integrityService'
  );
  try {
    const countsOnly = process.argv.includes('--counts-only');
    const issues = await findIntegrityIssues(prisma);
    console.log(formatIntegrityReport(issues, countsOnly));
    return hasBlockingIssues(issues) ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });
