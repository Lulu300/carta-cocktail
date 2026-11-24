import { ConflictError } from '../errors';

export interface UniqueValueRow {
  id: number;
  value: string;
}

/** How a value compares with the rows of a `CaseInsensitiveIndex`. */
export type CaseInsensitiveMatch<Row> =
  | { status: 'none' }
  | { status: 'found'; row: Row }
  | { status: 'ambiguous'; rows: Row[] };

/**
 * Rows of a small reference table (categories, units) by the value that must be unique
 * ignoring case: a category name, a unit abbreviation.
 *
 * The unique indexes of SQLite compare text with case, and Prisma has no case-insensitive
 * filter on SQLite: the comparison is done here. Data older than that rule (C-07) may still
 * hold two rows that differ only by case ('Rum' and 'rum').
 */
export class CaseInsensitiveIndex<Row> {
  private readonly rowsByKey = new Map<string, Row[]>();

  constructor(rows: Row[], private readonly valueOf: (row: Row) => string) {
    rows.forEach((row) => this.add(row));
  }

  add(row: Row): void {
    const key = this.valueOf(row).toLowerCase();
    const sameKey = this.rowsByKey.get(key);
    if (sameKey) sameKey.push(row);
    else this.rowsByKey.set(key, [row]);
  }

  /**
   * The row that holds `value`: the one with the exact value first, else the only one equal
   * ignoring case. Several rows equal ignoring case and none exactly is ambiguous: taking one
   * of them would be a guess.
   */
  match(value: string): CaseInsensitiveMatch<Row> {
    const candidates = this.rowsByKey.get(value.toLowerCase()) ?? [];
    const exact = candidates.find((row) => this.valueOf(row) === value);
    if (exact) return { status: 'found', row: exact };
    if (candidates.length === 1) return { status: 'found', row: candidates[0] };
    return candidates.length === 0 ? { status: 'none' } : { status: 'ambiguous', rows: candidates };
  }

  /**
   * `match`, with an ambiguous value refused: a 409 under `conflictKey` that names the value
   * and the rows it could mean, so the admin knows which ones to tell apart.
   */
  findUnambiguous(value: string, conflictKey: string): Row | null {
    const match = this.match(value);
    if (match.status === 'ambiguous') {
      const matches = match.rows.map((row) => this.valueOf(row)).join(', ');
      throw new ConflictError(conflictKey, { name: value, matches });
    }
    return match.status === 'found' ? match.row : null;
  }

  /**
   * The row an import uses for `value`, created by `create` only when no row holds it ignoring
   * case: the routes refuse a second row that differs only by case, so an import does not make
   * one either. The created row joins the index, so a later value of the same import finds it.
   */
  async findOrCreate(value: string, conflictKey: string, create: () => Promise<Row>): Promise<Row> {
    const existing = this.findUnambiguous(value, conflictKey);
    if (existing) return existing;
    const created = await create();
    this.add(created);
    return created;
  }
}

/**
 * What an import preview says of a match: the row found (`matched`), nothing (`missing`), or,
 * for an ambiguous value, no match and the rows it could mean, for the admin to pick one.
 */
export function previewMatch<Row, Preview>(match: CaseInsensitiveMatch<Row>, toPreview: (row: Row) => Preview) {
  switch (match.status) {
    case 'found':
      return { existingMatch: toPreview(match.row), status: 'matched' as const };
    case 'none':
      return { existingMatch: null, status: 'missing' as const };
    case 'ambiguous':
      return { existingMatch: null, status: 'ambiguous' as const, ambiguousMatches: match.rows.map(toPreview) };
  }
}

/** Throws a 409 when another row already holds `value`, ignoring case. */
export function assertUniqueIgnoringCase(rows: UniqueValueRow[], value: string, ownId?: number): void {
  const otherRows = rows.filter((row) => row.id !== ownId);
  const isTaken = new CaseInsensitiveIndex(otherRows, (row) => row.value).match(value).status !== 'none';
  if (isTaken) throw new ConflictError();
}
