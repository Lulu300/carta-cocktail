import AdmZip from 'adm-zip';
import { z } from 'zod';
import { NullableDate, Percent } from '../validation/common';
import { AlcoholPercentage, CapacityMl, PurchasePrice } from '../validation/bottles';
import { DesiredStock } from '../validation/categories';
import { MAX_IMPORT_BOTTLES, MAX_IMPORT_ROWS, totalQuantity } from '../validation/bottleImport';
import { unprotectFormula, UTF8_BOM } from './bottlesExport';

export const BOTTLE_IMPORT_VERSION = 1;

/** Largest file the parser reads from a ZIP once uncompressed. */
export const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;

// Same bound as the confirmation schema (BottleQuantity): larger quantities are capped
const MAX_ROW_QUANTITY = 50;

export interface ImportCategoryRecord {
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: Record<string, string> | null;
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

export type ImportRowErrorCode = 'required' | 'outOfRange' | 'invalidDate' | 'invalidNumber';

/**
 * A row left out of the import. `line` is the line of the CSV file (header = 1),
 * or the position in the JSON array (first = 1).
 */
export interface ImportRowError {
  line: number;
  field: string;
  code: ImportRowErrorCode;
}

export interface NormalizedImportPayload {
  version: number;
  categories: ImportCategoryRecord[];
  bottles: ImportBottleRecord[];
  errors: ImportRowError[];
}

export type ImportParseErrorCode =
  | 'missingColumn'
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

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(stripBom(text));
  } catch {
    throw new ImportParseError('invalidJson');
  }
}

interface CsvRecord {
  line: number;
  text: string;
}

/** Splits on the newlines that are not inside a quoted field, keeping the line each record starts on. */
function splitCsvRecords(csv: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let current = '';
  let currentLine = 1;
  let line = 1;
  let inQuotes = false;
  const pushCurrent = () => {
    if (current.trim().length > 0) records.push({ line: currentLine, text: current });
    current = '';
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (inQuotes && csv[i + 1] === '"') { current += '""'; i++; continue; }
      inQuotes = !inQuotes;
      current += c;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      line++;
      if (!inQuotes) {
        pushCurrent();
        currentLine = line;
        continue;
      }
    }
    current += c;
  }
  pushCurrent();
  return records;
}

/** Counts the separators outside quoted fields. */
function countOutsideQuotes(line: string, separator: string): number {
  let count = 0;
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === separator && !inQuotes) count++;
  }
  return count;
}

/** Excel in a French locale separates the columns with semicolons. */
function detectSeparator(headerLine: string): string {
  return countOutsideQuotes(headerLine, ';') > countOutsideQuotes(headerLine, ',') ? ';' : ',';
}

function parseCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; continue; }
        inQuotes = false; continue;
      }
      current += c;
    } else {
      if (c === separator) { fields.push(current); current = ''; continue; }
      if (c === '"' && current === '') { inQuotes = true; continue; }
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

/** Rows keyed by column name. Rows whose cells are all blank (left by spreadsheets) are dropped. */
function readCsvRows(csv: string): { headers: string[]; rows: NumberedRow[] } {
  const records = splitCsvRecords(stripBom(csv));
  if (records.length === 0) return { headers: [], rows: [] };

  const separator = detectSeparator(records[0].text);
  const headers = parseCsvLine(records[0].text, separator).map((header) => header.trim());
  const rows: NumberedRow[] = [];
  for (const record of records.slice(1)) {
    const cells = parseCsvLine(record.text, separator).map((cell) => unprotectFormula(cell.trim()));
    if (cells.every((cell) => cell === '')) continue;
    const values: RawRow = {};
    headers.forEach((header, index) => { values[header] = cells[index] ?? ''; });
    rows.push({ line: record.line, values });
  }
  return { headers, rows };
}

const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
const TRUE_WORDS = new Set(['true', '1', 'yes', 'vrai', 'oui']);

/** A number from a cell or a JSON value: null when blank, NaN when it is not a number. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (text === '') return null;
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

/** Reads the fields of one row and records the first reason to leave it out. */
class RowReader {
  error: ImportRowError | null = null;

  constructor(private readonly row: NumberedRow) {}

  private fail(field: string, code: ImportRowErrorCode): void {
    this.error ??= { line: this.row.line, field, code };
  }

  text(field: string): string {
    return toText(this.row.values[field]);
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
    const value = toNumber(this.row.values[field]);
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

  /** Kept as written: the confirmation turns it into a date. */
  date(field: string): string | null {
    const value = this.row.values[field];
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !NullableDate.safeParse(value).success) {
      this.fail(field, 'invalidDate');
      return null;
    }
    return value;
  }

  /** An object in JSON, a JSON text in a CSV cell; anything else counts as no translations. */
  nameTranslations(field: string): Record<string, string> | null {
    const value = this.row.values[field];
    const translations = typeof value === 'string' ? parseJsonOrNull(value) : value;
    return isRecord(translations) ? (translations as Record<string, string>) : null;
  }
}

function readBottle(row: NumberedRow): { bottle: ImportBottleRecord; error: ImportRowError | null } {
  const reader = new RowReader(row);
  const bottle: ImportBottleRecord = {
    name: reader.requiredText('name'),
    categoryName: reader.text('categoryName'),
    capacityMl: reader.number('capacityMl', CapacityMl),
    remainingPercent: reader.number('remainingPercent', Percent, 100),
    alcoholPercentage: reader.number('alcoholPercentage', AlcoholPercentage, null),
    purchasePrice: reader.number('purchasePrice', PurchasePrice, null),
    location: reader.optionalText('location'),
    openedAt: reader.date('openedAt'),
    isApero: reader.bool('isApero'),
    isDigestif: reader.bool('isDigestif'),
    quantity: reader.quantity('quantity'),
  };
  return { bottle, error: reader.error };
}

function readCategory(row: NumberedRow): { category: ImportCategoryRecord; error: ImportRowError | null } {
  const reader = new RowReader(row);
  const category: ImportCategoryRecord = {
    name: reader.text('name'),
    type: reader.text('type') || 'SPIRIT',
    desiredStock: reader.number('desiredStock', DesiredStock, 1),
    minimumPercent: reader.number('minimumPercent', Percent, 30),
    nameTranslations: reader.nameTranslations('nameTranslations'),
  };
  return { category, error: reader.error };
}

function assertRowCount(count: number): void {
  if (count > MAX_IMPORT_ROWS) throw new ImportParseError('tooManyRows', { max: MAX_IMPORT_ROWS });
}

interface KeptBottle {
  bottle: ImportBottleRecord;
  row: NumberedRow;
}

/** Keeps the valid bottles with their row; each invalid row is listed in `errors`. */
function readBottles(rows: NumberedRow[], errors: ImportRowError[]): KeptBottle[] {
  assertRowCount(rows.length);
  const kept: KeptBottle[] = [];
  for (const row of rows) {
    const { bottle, error } = readBottle(row);
    if (error) errors.push(error);
    else kept.push({ bottle, row });
  }
  if (totalQuantity(kept.map(({ bottle }) => bottle)) > MAX_IMPORT_BOTTLES) {
    throw new ImportParseError('tooManyBottles', { max: MAX_IMPORT_BOTTLES });
  }
  return kept;
}

/** Keeps the valid categories with a name; each invalid row is listed in `errors`. */
function readCategories(rows: NumberedRow[], errors: ImportRowError[]): ImportCategoryRecord[] {
  assertRowCount(rows.length);
  const categories: ImportCategoryRecord[] = [];
  for (const row of rows) {
    const { category, error } = readCategory(row);
    if (error) errors.push(error);
    else if (category.name) categories.push(category);
  }
  return categories;
}

const REQUIRED_CSV_COLUMNS = ['name', 'capacityMl'];

export function parseCsvBottles(csv: string): NormalizedImportPayload {
  const { headers, rows } = readCsvRows(csv);
  const errors: ImportRowError[] = [];
  if (headers.length === 0) {
    return { version: BOTTLE_IMPORT_VERSION, categories: [], bottles: [], errors };
  }
  const missing = REQUIRED_CSV_COLUMNS.find((column) => !headers.includes(column));
  if (missing) throw new ImportParseError('missingColumn', { column: missing });

  const kept = readBottles(rows, errors);

  // A CSV has no category list: each category named by a kept row is created with the defaults
  const categories = new Map<string, ImportCategoryRecord>();
  for (const { bottle, row } of kept) {
    const key = bottle.categoryName.toLowerCase();
    if (!bottle.categoryName || categories.has(key)) continue;
    categories.set(key, {
      name: bottle.categoryName,
      type: toText(row.values.categoryType) || 'SPIRIT',
      desiredStock: 1,
      minimumPercent: 30,
      nameTranslations: null,
    });
  }

  return {
    version: BOTTLE_IMPORT_VERSION,
    categories: Array.from(categories.values()),
    bottles: kept.map(({ bottle }) => bottle),
    errors,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON arrays numbered from 1, as the admin counts them. */
function numberJsonRows(items: unknown[]): NumberedRow[] {
  return items.map((item, index) => ({ line: index + 1, values: isRecord(item) ? item : {} }));
}

export function parseJsonBottles(json: unknown): NormalizedImportPayload {
  if (!isRecord(json) || json.version !== BOTTLE_IMPORT_VERSION) {
    throw new ImportParseError('unsupportedVersion');
  }
  if (!Array.isArray(json.bottles)) throw new ImportParseError('bottlesRequired');

  const errors: ImportRowError[] = [];
  const categories = readCategories(numberJsonRows(Array.isArray(json.categories) ? json.categories : []), errors);
  const bottles = readBottles(numberJsonRows(json.bottles), errors).map(({ bottle }) => bottle);
  return { version: BOTTLE_IMPORT_VERSION, categories, bottles, errors };
}

function parseCategoriesCsv(csv: string, errors: ImportRowError[]): ImportCategoryRecord[] {
  const { headers, rows } = readCsvRows(csv);
  if (!headers.includes('name')) return [];
  return readCategories(rows, errors);
}

function readZipEntryText(entry: AdmZip.IZipEntry): string {
  if (entry.header.size > MAX_ZIP_ENTRY_BYTES) {
    throw new ImportParseError('zipEntryTooLarge', { maxMb: MAX_ZIP_ENTRY_BYTES / 1024 / 1024 });
  }
  try {
    return entry.getData().toString('utf8');
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

export function parseZipBottles(buffer: Buffer): NormalizedImportPayload {
  const entries = readZipEntries(buffer).filter((entry) => !entry.isDirectory);

  const bottlesEntry = entries.find(
    (e) => e.entryName === 'bottles.csv' || e.entryName === 'bottles.json'
  );
  if (!bottlesEntry) throw new ImportParseError('zipMissingBottles');

  const bottlesText = readZipEntryText(bottlesEntry);
  const payload = bottlesEntry.entryName.endsWith('.csv')
    ? parseCsvBottles(bottlesText)
    : parseJsonBottles(parseJsonText(bottlesText));

  const categoriesEntry = entries.find((e) => e.entryName === 'categories.csv');
  if (categoriesEntry) {
    const explicitCategories = parseCategoriesCsv(readZipEntryText(categoriesEntry), payload.errors);
    const merged = new Map<string, ImportCategoryRecord>();
    for (const c of payload.categories) merged.set(c.name.toLowerCase(), c);
    for (const c of explicitCategories) merged.set(c.name.toLowerCase(), c);
    payload.categories = Array.from(merged.values());
  }

  return payload;
}

export function parseImportFile(filename: string, buffer: Buffer): NormalizedImportPayload {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) {
    return parseZipBottles(buffer);
  }
  if (lower.endsWith('.json')) {
    return parseJsonBottles(parseJsonText(buffer.toString('utf8')));
  }
  if (lower.endsWith('.csv')) {
    return parseCsvBottles(buffer.toString('utf8'));
  }
  throw new ImportParseError('unsupportedFormat');
}
