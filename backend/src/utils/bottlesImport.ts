import AdmZip from 'adm-zip';
import { z } from 'zod';
import { Percent, Translations } from '../validation/common';
import { AlcoholPercentage, CapacityMl, PurchasePrice } from '../validation/bottles';
import { DesiredStock } from '../validation/categories';
import { MAX_IMPORT_BOTTLES, MAX_IMPORT_ROWS, totalQuantity } from '../validation/bottleImport';
import { unprotectFormula, UTF8_BOM } from './bottlesExport';
import { parseImportDate } from './importDates';
import { isRecord } from './records';

export const BOTTLE_IMPORT_VERSION = 1;

/** Largest bottle import file accepted, this size included (multer's fileSize, see backend/AGENTS.md). */
export const MAX_BOTTLE_IMPORT_BYTES = 10 * 1024 * 1024;

/** Largest file the parser reads from a ZIP once uncompressed. */
export const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;

// Same bound as the confirmation schema (BottleQuantity): larger quantities are capped
const MAX_ROW_QUANTITY = 50;

export interface ImportCategoryRecord {
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: z.output<typeof Translations>;
}

export interface ImportBottleRecord {
  name: string;
  categoryName: string;
  capacityMl: number;
  remainingPercent: number;
  alcoholPercentage: number | null;
  purchasePrice: number | null;
  location: string | null;
  openedAt: string | null;
  isApero: boolean;
  isDigestif: boolean;
  quantity: number;
}

export type ImportRowErrorCode =
  'required' | 'outOfRange' | 'invalidDate' | 'invalidNumber' | 'malformedQuotes';

/** The list a row belongs to: a JSON file or a ZIP archive holds both. */
export type ImportRowSource = 'bottles' | 'categories';

/**
 * A row left out of the import. `line` is the line of the CSV file (header = 1),
 * or the position in the JSON array (first = 1), within `source`. `field` is the column name;
 * a CSV cell past the last named column has none, and `column` (first = 1) locates it instead.
 */
export interface ImportRowError {
  source: ImportRowSource;
  line: number;
  field: string;
  column?: number;
  code: ImportRowErrorCode;
}

export type ImportRowWarningCode = 'lineBreak';

/**
 * A value of a kept row the import takes as it is, but that the admin should check. Located
 * like an `ImportRowError`: a CSV record is named by the line it starts on.
 *
 * `lineBreak`: a line break in a single-line text column. The app's own export writes such
 * values, so they are kept; but a quote the file misplaces can also merge the lines that follow
 * it into one valid quoted cell (`"Bourbon,700` closed lines later by `C 3",700`).
 */
export interface ImportRowWarning {
  source: ImportRowSource;
  line: number;
  field: string;
  code: ImportRowWarningCode;
}

export interface NormalizedImportPayload {
  version: number;
  categories: ImportCategoryRecord[];
  bottles: ImportBottleRecord[];
  errors: ImportRowError[];
  warnings: ImportRowWarning[];
}

export type ImportParseErrorCode =
  | 'missingColumn'
  | 'malformedHeader'
  | 'invalidJson'
  | 'unsupportedVersion'
  | 'bottlesRequired'
  | 'invalidZip'
  | 'zipMissingBottles'
  | 'zipEntryTooLarge'
  | 'unsupportedFormat'
  | 'tooManyRows'
  | 'tooManyBottles';

/** A file the import cannot read at all. The route answers 400 with `errors.import.<code>`. */
export class ImportParseError extends Error {
  constructor(
    public readonly code: ImportParseErrorCode,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'ImportParseError';
  }
}

/** A row of a file: CSV cells are strings, JSON values keep their type. */
type RawRow = Record<string, unknown>;

interface NumberedRow {
  line: number;
  values: RawRow;
}

/**
 * Excel and Notepad start a UTF-8 file with a byte order mark, which is not part of the data.
 * Every text entry point (CSV rows, JSON text) removes it.
 */
export function stripBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const windows1252 = new TextDecoder('windows-1252');

function startsWithUtf8Bom(bytes: Buffer): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

/**
 * Excel's default French CSV format ("CSV (séparateur : point-virgule)") is Windows-1252, without a BOM.
 * Read as UTF-8, its accents would become U+FFFD without a warning. Valid UTF-8 always wins, and a BOM
 * declares UTF-8, so a UTF-8 file is never read as Windows-1252: only bytes that are not UTF-8 are.
 */
export function decodeCsvBytes(bytes: Buffer): string {
  if (startsWithUtf8Bom(bytes)) return bytes.toString('utf8');
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return windows1252.decode(bytes);
  }
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(stripBom(text));
  } catch {
    throw new ImportParseError('invalidJson');
  }
}

const QUOTE = '"';
const CSV_SEPARATORS = [',', ';'];

function isLineBreak(c: string | undefined): boolean {
  return c === '\n' || c === '\r';
}

/** Spaces a hand-written file may leave between a closing quote and the separator. */
function isPadding(c: string | undefined): boolean {
  return c === ' ' || c === '\t';
}

/**
 * A record of the file, with the line it starts on. `malformedCell` is the index of the cell
 * whose quotes the reader could not make sense of: the record is reported, never read.
 */
interface CsvRecord {
  line: number;
  cells: string[];
  malformedCell?: number;
}

/**
 * Reads CSV records (RFC 4180) in one pass, so that records and cells agree on where a quoted
 * cell starts: only a quote at the start of a cell opens one, any other quote is text.
 *
 * A quoted cell never closed, or followed by text, means a quote the file did not mean as one
 * (`"Special" Reserve`, or `"Bourbon` closed lines later by the quote of `12" edition`). Its
 * record is reported, and reading starts again on the line after the opening quote: no line
 * after it is swallowed.
 */
class CsvReader {
  private position = 0;
  private line = 1;

  constructor(
    private readonly text: string,
    private readonly separator: string,
  ) {}

  /** Every record, lines left blank left out. */
  readAll(): CsvRecord[] {
    const records: CsvRecord[] = [];
    while (this.position < this.text.length) {
      const start = this.position;
      const record = this.readRecord();
      if (this.text.slice(start, this.position).trim() !== '') records.push(record);
    }
    return records;
  }

  private readRecord(): CsvRecord {
    const line = this.line;
    const cells: string[] = [];
    for (;;) {
      const cell =
        this.text[this.position] === QUOTE ? this.readQuotedCell() : this.readPlainCell();
      if (cell === null) return { line, cells, malformedCell: cells.length };
      cells.push(cell);
      if (this.text[this.position] !== this.separator) break;
      this.position++;
    }
    this.skipLineBreak();
    return { line, cells };
  }

  /** The text up to the separator or the end of the line, quotes included. */
  private readPlainCell(): string {
    const start = this.position;
    while (this.position < this.text.length) {
      const c = this.text[this.position];
      if (c === this.separator || isLineBreak(c)) break;
      this.position++;
    }
    return this.text.slice(start, this.position);
  }

  /** The value between the quotes, line breaks kept as written; null when the quotes are malformed. */
  private readQuotedCell(): string | null {
    const openingPosition = this.position;
    const openingLine = this.line;
    let value = '';
    this.position++;
    while (this.position < this.text.length) {
      const c = this.text[this.position];
      if (c === QUOTE && this.text[this.position + 1] === QUOTE) {
        value += QUOTE;
        this.position += 2;
      } else if (c === QUOTE) {
        this.position++;
        if (this.isCellEndAfterClosingQuote()) return value;
        break;
      } else if (isLineBreak(c)) {
        const start = this.position;
        this.skipLineBreak();
        value += this.text.slice(start, this.position);
      } else {
        value += c;
        this.position++;
      }
    }
    this.restartAfterLineOf(openingPosition, openingLine);
    return null;
  }

  private isCellEndAfterClosingQuote(): boolean {
    while (isPadding(this.text[this.position])) this.position++;
    const next = this.text[this.position];
    return next === undefined || next === this.separator || isLineBreak(next);
  }

  private restartAfterLineOf(position: number, line: number): void {
    this.position = position;
    this.line = line;
    while (this.position < this.text.length && !isLineBreak(this.text[this.position]))
      this.position++;
    this.skipLineBreak();
  }

  /** Moves past `\n`, `\r\n` or `\r`, if there is one here. */
  private skipLineBreak(): void {
    const c = this.text[this.position];
    if (!isLineBreak(c)) return;
    this.position += c === '\r' && this.text[this.position + 1] === '\n' ? 2 : 1;
    this.line++;
  }
}

/**
 * Counts `separator` outside quoted cells. The separator is not known yet: a quote opens a cell
 * at the start of the line or after either separator.
 */
function countOutsideQuotes(line: string, separator: string): number {
  let count = 0;
  let inQuotes = false;
  let atCellStart = true;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === QUOTE && line[i + 1] === QUOTE) i++;
      else if (c === QUOTE) inQuotes = false;
    } else if (c === QUOTE && atCellStart) {
      inQuotes = true;
    } else if (c === separator) {
      count++;
    }
    atCellStart = !inQuotes && CSV_SEPARATORS.includes(c);
  }
  return count;
}

/** The header: the first line that is not blank. Excel never writes a header on several lines. */
function firstNonBlankLine(text: string): string {
  return text.split(/\r\n|\r|\n/).find((line) => line.trim() !== '') ?? '';
}

/** Excel in a French locale separates the columns with semicolons. */
function detectSeparator(headerLine: string): string {
  return countOutsideQuotes(headerLine, ';') > countOutsideQuotes(headerLine, ',') ? ';' : ',';
}

function malformedRowError(
  line: number,
  cell: number,
  headers: string[],
  source: ImportRowSource,
): ImportRowError {
  const field = headers[cell] ?? '';
  const error: ImportRowError = { source, line, field, code: 'malformedQuotes' };
  return field ? error : { ...error, column: cell + 1 };
}

/**
 * Rows keyed by column name. Rows whose cells are all blank (left by spreadsheets) are dropped;
 * rows with malformed quotes are listed in `errors`.
 */
function readCsvRows(
  csv: string,
  source: ImportRowSource,
): { headers: string[]; rows: NumberedRow[]; errors: ImportRowError[] } {
  const text = stripBom(csv);
  const [header, ...records] = new CsvReader(
    text,
    detectSeparator(firstNonBlankLine(text)),
  ).readAll();
  if (header === undefined) return { headers: [], rows: [], errors: [] };
  if (header.malformedCell !== undefined)
    throw new ImportParseError('malformedHeader', { file: `${source}.csv` });

  const headers = header.cells.map((cell) => cell.trim());
  const rows: NumberedRow[] = [];
  const errors: ImportRowError[] = [];
  for (const record of records) {
    if (record.malformedCell !== undefined) {
      errors.push(malformedRowError(record.line, record.malformedCell, headers, source));
      continue;
    }
    const cells = record.cells.map((cell) => unprotectFormula(cell.trim()));
    if (cells.every((cell) => cell === '')) continue;
    const values: RawRow = {};
    headers.forEach((column, index) => {
      values[column] = cells[index] ?? '';
    });
    rows.push({ line: record.line, values });
  }
  return { headers, rows, errors };
}

/** The errors of a file in the order of its lines, as the admin reads it. */
function byLine(errors: ImportRowError[]): ImportRowError[] {
  return [...errors].sort((a, b) => a.line - b.line);
}

const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
// `\s` matches the no-break (U+00A0) and narrow no-break (U+202F) spaces Excel in a French locale writes
const SPACE_GROUPED_THOUSANDS = /^[+-]?\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?$/u;
const TRUE_WORDS = new Set(['true', '1', 'yes', 'vrai', 'oui']);

/** The unit a spreadsheet may display after the number of a column. */
type ColumnUnit = '€' | '%' | 'ml';

/**
 * Only the column's own unit is removed: `70 cl` in `capacityMl` stays an invalid number
 * rather than being read as 70 ml.
 */
const COLUMN_UNITS: Partial<Record<string, ColumnUnit>> = {
  capacityMl: 'ml',
  remainingPercent: '%',
  alcoholPercentage: '%',
  purchasePrice: '€',
  minimumPercent: '%',
};

/** `700 ml`, `700ML`, `40 %`, `25,90 €`, `€25.00`: the number without the unit, or the text unchanged. */
function stripUnit(text: string, unit: ColumnUnit | undefined): string {
  if (unit === undefined) return text;
  // Excel in an English locale writes the euro sign before the number
  if (unit === '€' && text.startsWith(unit)) return text.slice(unit.length).trimStart();
  if (!text.toLowerCase().endsWith(unit)) return text;
  return text.slice(0, -unit.length).trimEnd();
}

/**
 * A number from a cell or a JSON value: null when blank, NaN when it is not a number.
 * Excel writes the displayed value into a CSV, so a cell may hold the column's unit
 * and thousands grouped with spaces (`1 234,50 €`).
 */
function toNumber(value: unknown, unit?: ColumnUnit): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const withoutUnit = stripUnit(trimmed, unit);
  // A unit alone is not a number (Number('') would read it as 0)
  if (withoutUnit === '') return NaN;
  const text = SPACE_GROUPED_THOUSANDS.test(withoutUnit)
    ? withoutUnit.replace(/\s/gu, '')
    : withoutUnit;
  // Excel in a French locale writes decimals with a comma
  return Number(DECIMAL_COMMA.test(text) ? text.replace(',', '.') : text);
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return typeof value === 'string' && TRUE_WORDS.has(value.trim().toLowerCase());
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function hasLineBreak(text: string): boolean {
  return text.includes('\n') || text.includes('\r');
}

/**
 * Reads the fields of one row, and records the first reason to leave it out and the values
 * to check. Every text field of the format is a single-line one: names, types, location.
 */
class RowReader {
  error: ImportRowError | null = null;
  readonly warnings: ImportRowWarning[] = [];

  constructor(
    private readonly row: NumberedRow,
    private readonly source: ImportRowSource,
  ) {}

  private fail(field: string, code: ImportRowErrorCode): void {
    this.error ??= { source: this.source, line: this.row.line, field, code };
  }

  private warn(field: string, code: ImportRowWarningCode): void {
    this.warnings.push({ source: this.source, line: this.row.line, field, code });
  }

  /** A single-line text, kept with its line breaks (see `ImportRowWarning`). */
  text(field: string): string {
    const value = toText(this.row.values[field]);
    if (hasLineBreak(value)) this.warn(field, 'lineBreak');
    return value;
  }

  requiredText(field: string): string {
    const value = this.text(field);
    if (!value) this.fail(field, 'required');
    return value;
  }

  optionalText(field: string): string | null {
    return this.text(field) || null;
  }

  bool(field: string): boolean {
    return toBool(this.row.values[field]);
  }

  /** A number checked by `schema`; a blank value gives `fallback`, or fails when there is none. */
  number<T extends number | null>(field: string, schema: z.ZodType<T>, fallback?: T): T {
    const value = toNumber(this.row.values[field], COLUMN_UNITS[field]);
    if (value === null) {
      if (fallback === undefined) this.fail(field, 'required');
      return fallback as T;
    }
    if (Number.isNaN(value)) {
      this.fail(field, 'invalidNumber');
      return value as T;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      // invalid_type: a decimal where a whole number is expected
      const isWrongKind = result.error.issues[0].code === 'invalid_type';
      this.fail(field, isWrongKind ? 'invalidNumber' : 'outOfRange');
    }
    return value as T;
  }

  /** Capped between 1 and 50, as the import always did. */
  quantity(field: string): number {
    const value = toNumber(this.row.values[field]);
    if (value === null) return 1;
    if (Number.isNaN(value)) {
      this.fail(field, 'invalidNumber');
      return 1;
    }
    return Math.max(1, Math.min(MAX_ROW_QUANTITY, Math.floor(value)));
  }

  /**
   * A date read in the order of `language` (`12/03/2024`), sent on as ISO 8601: the
   * confirmation reads it without guessing the order again.
   */
  date(field: string, language: string): string | null {
    const value = this.row.values[field];
    if (value === null || value === undefined || value === '') return null;
    const date = typeof value === 'string' ? parseImportDate(value, language) : null;
    if (date === null) this.fail(field, 'invalidDate');
    return date;
  }

  /** An object in JSON, a JSON text in a CSV cell; anything else counts as no translations. */
  nameTranslations(field: string): ImportCategoryRecord['nameTranslations'] {
    const value = this.row.values[field];
    const translations = typeof value === 'string' ? parseJsonOrNull(value) : value;
    // The confirmation's rule: a language it would refuse (e.g. `de`) drops the translations
    const result = Translations.safeParse(translations);
    if (!result.success) return null;
    // Each translation is a name, on a single line like the name itself
    if (Object.values(result.data ?? {}).some(hasLineBreak)) this.warn(field, 'lineBreak');
    return result.data;
  }
}

interface ReadRow {
  error: ImportRowError | null;
  warnings: ImportRowWarning[];
}

/**
 * A bottle row. `categoryType` is the type of its category, used when no list and no earlier
 * row gives that category (see `withRowCategories`).
 */
function readBottle(
  row: NumberedRow,
  language: string,
): ReadRow & { bottle: ImportBottleRecord; categoryType: string } {
  const reader = new RowReader(row, 'bottles');
  const bottle: ImportBottleRecord = {
    name: reader.requiredText('name'),
    categoryName: reader.text('categoryName'),
    capacityMl: reader.number('capacityMl', CapacityMl),
    remainingPercent: reader.number('remainingPercent', Percent, 100),
    alcoholPercentage: reader.number('alcoholPercentage', AlcoholPercentage, null),
    purchasePrice: reader.number('purchasePrice', PurchasePrice, null),
    location: reader.optionalText('location'),
    openedAt: reader.date('openedAt', language),
    isApero: reader.bool('isApero'),
    isDigestif: reader.bool('isDigestif'),
    quantity: reader.quantity('quantity'),
  };
  const categoryType = reader.text('categoryType');
  return { bottle, categoryType, error: reader.error, warnings: reader.warnings };
}

function readCategory(row: NumberedRow): ReadRow & { category: ImportCategoryRecord } {
  const reader = new RowReader(row, 'categories');
  const category: ImportCategoryRecord = {
    name: reader.text('name'),
    type: reader.text('type') || 'SPIRIT',
    desiredStock: reader.number('desiredStock', DesiredStock, 1),
    minimumPercent: reader.number('minimumPercent', Percent, 30),
    nameTranslations: reader.nameTranslations('nameTranslations'),
  };
  return { category, error: reader.error, warnings: reader.warnings };
}

function assertRowCount(count: number): void {
  if (count > MAX_IMPORT_ROWS) throw new ImportParseError('tooManyRows', { max: MAX_IMPORT_ROWS });
}

interface KeptBottle {
  bottle: ImportBottleRecord;
  categoryType: string;
}

/**
 * What the reading of a file reports: each invalid row in `errors`, and the values to check
 * of the rows kept in `warnings` (a row left out is not imported: nothing of it to check).
 */
type RowReport = Pick<NormalizedImportPayload, 'errors' | 'warnings'>;

/** Adds the row to `report`; true when the row is kept. */
function reportRow(row: ReadRow, report: RowReport): boolean {
  if (row.error) {
    report.errors.push(row.error);
    return false;
  }
  report.warnings.push(...row.warnings);
  return true;
}

/** Keeps the valid bottles with the type of their category. */
function readBottles(rows: NumberedRow[], report: RowReport, language: string): KeptBottle[] {
  assertRowCount(rows.length);
  const kept: KeptBottle[] = [];
  for (const row of rows) {
    const read = readBottle(row, language);
    if (reportRow(read, report))
      kept.push({ bottle: read.bottle, categoryType: read.categoryType });
  }
  if (totalQuantity(kept.map(({ bottle }) => bottle)) > MAX_IMPORT_BOTTLES) {
    throw new ImportParseError('tooManyBottles', { max: MAX_IMPORT_BOTTLES });
  }
  return kept;
}

/** Keeps the valid categories with a name. */
function readCategories(rows: NumberedRow[], report: RowReport): ImportCategoryRecord[] {
  assertRowCount(rows.length);
  const categories: ImportCategoryRecord[] = [];
  for (const row of rows) {
    const read = readCategory(row);
    // A valid row without a name is dropped without a message, its values unchecked
    if (!read.error && !read.category.name) continue;
    if (reportRow(read, report)) categories.push(read.category);
  }
  return categories;
}

const REQUIRED_CSV_COLUMNS = ['name', 'capacityMl'];

/**
 * `language` is the admin's (`Accept-Language`): it gives the order of a date typed in a
 * spreadsheet (see importDates.ts).
 */
export function parseCsvBottles(csv: string, language: string): NormalizedImportPayload {
  const { headers, rows, errors } = readCsvRows(csv, 'bottles');
  if (headers.length === 0) {
    return { version: BOTTLE_IMPORT_VERSION, categories: [], bottles: [], errors, warnings: [] };
  }
  const missing = REQUIRED_CSV_COLUMNS.find((column) => !headers.includes(column));
  if (missing) throw new ImportParseError('missingColumn', { column: missing });

  const report: RowReport = { errors, warnings: [] };
  const kept = readBottles(rows, report, language);

  // A CSV has no category list
  return {
    version: BOTTLE_IMPORT_VERSION,
    categories: withRowCategories([], kept),
    bottles: kept.map(({ bottle }) => bottle),
    errors: byLine(errors),
    // Rows are read in the order of the file
    warnings: report.warnings,
  };
}

/**
 * The categories listed, followed by each other category a kept row names, with the defaults.
 * The preview matches every category the rows need, so a name several existing categories
 * hold ignoring case is flagged before the confirmation refuses it.
 */
function withRowCategories(
  listed: ImportCategoryRecord[],
  kept: KeptBottle[],
): ImportCategoryRecord[] {
  const known = new Set(listed.map((category) => category.name.toLowerCase()));
  const named: ImportCategoryRecord[] = [];
  for (const { bottle, categoryType } of kept) {
    const key = bottle.categoryName.toLowerCase();
    if (!bottle.categoryName || known.has(key)) continue;
    known.add(key);
    named.push({
      name: bottle.categoryName,
      type: categoryType || 'SPIRIT',
      desiredStock: 1,
      minimumPercent: 30,
      nameTranslations: null,
    });
  }
  return [...listed, ...named];
}

/** JSON arrays numbered from 1, as the admin counts them. */
function numberJsonRows(items: unknown[]): NumberedRow[] {
  return items.map((item, index) => ({ line: index + 1, values: isRecord(item) ? item : {} }));
}

export function parseJsonBottles(json: unknown, language: string): NormalizedImportPayload {
  if (!isRecord(json) || json.version !== BOTTLE_IMPORT_VERSION) {
    throw new ImportParseError('unsupportedVersion');
  }
  if (!Array.isArray(json.bottles)) throw new ImportParseError('bottlesRequired');

  const report: RowReport = { errors: [], warnings: [] };
  const listed = readCategories(
    numberJsonRows(Array.isArray(json.categories) ? json.categories : []),
    report,
  );
  const kept = readBottles(numberJsonRows(json.bottles), report, language);
  // A hand-made file may leave out of its list a category its rows name, as a CSV always does
  return {
    version: BOTTLE_IMPORT_VERSION,
    categories: withRowCategories(listed, kept),
    bottles: kept.map(({ bottle }) => bottle),
    ...report,
  };
}

/** The categories of `categories.csv`; its rows are reported after those of the bottles. */
function parseCategoriesCsv(csv: string, report: RowReport): ImportCategoryRecord[] {
  const { headers, rows, errors } = readCsvRows(csv, 'categories');
  if (!headers.includes('name')) return [];
  const csvReport: RowReport = { errors, warnings: [] };
  const categories = readCategories(rows, csvReport);
  report.errors.push(...byLine(csvReport.errors));
  report.warnings.push(...csvReport.warnings);
  return categories;
}

function readZipEntryBytes(entry: AdmZip.IZipEntry): Buffer {
  if (entry.header.size > MAX_ZIP_ENTRY_BYTES) {
    throw new ImportParseError('zipEntryTooLarge', { maxMb: MAX_ZIP_ENTRY_BYTES / 1024 / 1024 });
  }
  try {
    return entry.getData();
  } catch {
    throw new ImportParseError('invalidZip');
  }
}

function readZipEntries(buffer: Buffer): AdmZip.IZipEntry[] {
  try {
    return new AdmZip(buffer).getEntries();
  } catch {
    throw new ImportParseError('invalidZip');
  }
}

export function parseZipBottles(buffer: Buffer, language: string): NormalizedImportPayload {
  const entries = readZipEntries(buffer).filter((entry) => !entry.isDirectory);

  const bottlesEntry = entries.find(
    (e) => e.entryName === 'bottles.csv' || e.entryName === 'bottles.json',
  );
  if (!bottlesEntry) throw new ImportParseError('zipMissingBottles');

  const bottlesBytes = readZipEntryBytes(bottlesEntry);
  const payload = bottlesEntry.entryName.endsWith('.csv')
    ? parseCsvBottles(decodeCsvBytes(bottlesBytes), language)
    : parseJsonBottles(parseJsonText(bottlesBytes.toString('utf8')), language);

  const categoriesEntry = entries.find((e) => e.entryName === 'categories.csv');
  if (categoriesEntry) {
    const explicitCategories = parseCategoriesCsv(
      decodeCsvBytes(readZipEntryBytes(categoriesEntry)),
      payload,
    );
    const merged = new Map<string, ImportCategoryRecord>();
    for (const c of payload.categories) merged.set(c.name.toLowerCase(), c);
    for (const c of explicitCategories) merged.set(c.name.toLowerCase(), c);
    payload.categories = Array.from(merged.values());
  }

  return payload;
}

export function parseImportFile(
  filename: string,
  buffer: Buffer,
  language: string,
): NormalizedImportPayload {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) {
    return parseZipBottles(buffer, language);
  }
  if (lower.endsWith('.json')) {
    return parseJsonBottles(parseJsonText(buffer.toString('utf8')), language);
  }
  if (lower.endsWith('.csv')) {
    return parseCsvBottles(decodeCsvBytes(buffer), language);
  }
  throw new ImportParseError('unsupportedFormat');
}
