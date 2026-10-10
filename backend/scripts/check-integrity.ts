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
import { prisma } from '../src/lib/prisma';
import { findIntegrityIssues, formatIntegrityReport, hasBlockingIssues } from '../src/services/integrityService';

async function main(): Promise<number> {
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
