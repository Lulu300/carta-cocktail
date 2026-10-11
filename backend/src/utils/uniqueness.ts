import { ConflictError } from '../errors';

export interface UniqueValueRow {
  id: number;
  value: string;
}

/**
 * Throws a 409 when another row already holds `value`, ignoring case.
 *
 * The unique indexes of SQLite compare text with case, and Prisma has no
 * case-insensitive filter on SQLite: the comparison is done here, on the
 * small reference tables (categories, units) that need it.
 */
export function assertUniqueIgnoringCase(rows: UniqueValueRow[], value: string, ownId?: number): void {
  const wanted = value.toLowerCase();
  const isTaken = rows.some((row) => row.id !== ownId && row.value.toLowerCase() === wanted);
  if (isTaken) throw new ConflictError();
}
