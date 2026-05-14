import AdmZip from 'adm-zip';

export const BOTTLE_IMPORT_VERSION = 1;

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

export interface NormalizedImportPayload {
  version: number;
  categories: ImportCategoryRecord[];
  bottles: ImportBottleRecord[];
}

function parseCsvLine(line: string): string[] {
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
      if (c === ',') { fields.push(current); current = ''; continue; }
      if (c === '"' && current === '') { inQuotes = true; continue; }
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function splitCsvLines(csv: string): string[] {
  // Splits on newlines that are NOT inside quoted fields.
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (inQuotes && csv[i + 1] === '"') { current += '""'; i++; continue; }
      inQuotes = !inQuotes;
      current += c;
      continue;
    }
    if (!inQuotes && (c === '\n' || c === '\r')) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      if (current.trim().length > 0) lines.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim().length > 0) lines.push(current);
  return lines;
}

function parseBool(value: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes';
}

function parseNumOrNull(value: string): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function parseIntOrDefault(value: string, fallback: number): number {
  if (value === '' || value == null) return fallback;
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

function parseStrOrNull(value: string): string | null {
  return value === '' || value == null ? null : value;
}

export function parseCsvBottles(csv: string): NormalizedImportPayload {
  const lines = splitCsvLines(csv);
  if (lines.length === 0) {
    return { version: BOTTLE_IMPORT_VERSION, categories: [], bottles: [] };
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => headers.indexOf(col);

  if (idx('name') === -1) {
    throw new Error('CSV missing required column: name');
  }
  if (idx('capacityMl') === -1) {
    throw new Error('CSV missing required column: capacityMl');
  }

  const bottles: ImportBottleRecord[] = [];
  const categoriesMap = new Map<string, ImportCategoryRecord>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const get = (col: string) => {
      const k = idx(col);
      return k === -1 ? '' : (fields[k] ?? '').trim();
    };

    const name = get('name');
    if (!name) continue;

    const categoryName = get('categoryName');
    const categoryType = get('categoryType') || 'SPIRIT';

    if (categoryName && !categoriesMap.has(categoryName.toLowerCase())) {
      categoriesMap.set(categoryName.toLowerCase(), {
        name: categoryName,
        type: categoryType,
        desiredStock: 1,
        minimumPercent: 30,
        nameTranslations: null,
      });
    }

    bottles.push({
      name,
      categoryName,
      capacityMl: parseIntOrDefault(get('capacityMl'), 0),
      remainingPercent: parseIntOrDefault(get('remainingPercent'), 100),
      alcoholPercentage: parseNumOrNull(get('alcoholPercentage')),
      purchasePrice: parseNumOrNull(get('purchasePrice')),
      location: parseStrOrNull(get('location')),
      openedAt: parseStrOrNull(get('openedAt')),
      isApero: parseBool(get('isApero')),
      isDigestif: parseBool(get('isDigestif')),
      quantity: Math.max(1, Math.min(50, parseIntOrDefault(get('quantity'), 1))),
    });
  }

  return {
    version: BOTTLE_IMPORT_VERSION,
    categories: Array.from(categoriesMap.values()),
    bottles,
  };
}

export function parseJsonBottles(json: any): NormalizedImportPayload {
  if (!json || json.version !== BOTTLE_IMPORT_VERSION) {
    throw new Error('Invalid JSON: missing or unsupported version');
  }
  if (!Array.isArray(json.bottles)) {
    throw new Error('Invalid JSON: bottles array is required');
  }

  const categories: ImportCategoryRecord[] = (Array.isArray(json.categories) ? json.categories : [])
    .map((c: any) => ({
      name: String(c.name || ''),
      type: String(c.type || 'SPIRIT'),
      desiredStock: typeof c.desiredStock === 'number' ? c.desiredStock : 1,
      minimumPercent: typeof c.minimumPercent === 'number' ? c.minimumPercent : 30,
      nameTranslations:
        c.nameTranslations && typeof c.nameTranslations === 'object' ? c.nameTranslations : null,
    }))
    .filter((c: ImportCategoryRecord) => c.name.length > 0);

  const bottles: ImportBottleRecord[] = json.bottles
    .map((b: any) => ({
      name: String(b.name || ''),
      categoryName: String(b.categoryName || ''),
      capacityMl: typeof b.capacityMl === 'number' ? b.capacityMl : parseInt(b.capacityMl) || 0,
      remainingPercent: typeof b.remainingPercent === 'number' ? b.remainingPercent : 100,
      alcoholPercentage: typeof b.alcoholPercentage === 'number' ? b.alcoholPercentage : null,
      purchasePrice: typeof b.purchasePrice === 'number' ? b.purchasePrice : null,
      location: typeof b.location === 'string' && b.location ? b.location : null,
      openedAt: typeof b.openedAt === 'string' && b.openedAt ? b.openedAt : null,
      isApero: !!b.isApero,
      isDigestif: !!b.isDigestif,
      quantity:
        typeof b.quantity === 'number' && b.quantity > 0
          ? Math.min(50, Math.floor(b.quantity))
          : 1,
    }))
    .filter((b: ImportBottleRecord) => b.name.length > 0);

  return { version: BOTTLE_IMPORT_VERSION, categories, bottles };
}

function parseCategoriesCsv(csv: string): ImportCategoryRecord[] {
  const lines = splitCsvLines(csv);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => headers.indexOf(col);
  if (idx('name') === -1) return [];

  const out: ImportCategoryRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const get = (col: string) => {
      const k = idx(col);
      return k === -1 ? '' : (fields[k] ?? '').trim();
    };
    const name = get('name');
    if (!name) continue;
    let translations: Record<string, string> | null = null;
    const rawT = get('nameTranslations');
    if (rawT) {
      try { translations = JSON.parse(rawT); } catch { translations = null; }
    }
    out.push({
      name,
      type: get('type') || 'SPIRIT',
      desiredStock: parseIntOrDefault(get('desiredStock'), 1),
      minimumPercent: parseIntOrDefault(get('minimumPercent'), 30),
      nameTranslations: translations,
    });
  }
  return out;
}

export function parseZipBottles(buffer: Buffer): NormalizedImportPayload {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const bottlesEntry = entries.find(
    (e) => !e.isDirectory && (e.entryName === 'bottles.csv' || e.entryName === 'bottles.json')
  );
  if (!bottlesEntry) {
    throw new Error('ZIP must contain bottles.csv or bottles.json');
  }

  let payload: NormalizedImportPayload;
  if (bottlesEntry.entryName.endsWith('.csv')) {
    payload = parseCsvBottles(bottlesEntry.getData().toString('utf8'));
  } else {
    payload = parseJsonBottles(JSON.parse(bottlesEntry.getData().toString('utf8')));
  }

  const categoriesEntry = entries.find(
    (e) => !e.isDirectory && e.entryName === 'categories.csv'
  );
  if (categoriesEntry) {
    const explicitCategories = parseCategoriesCsv(categoriesEntry.getData().toString('utf8'));
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
    return parseJsonBottles(JSON.parse(buffer.toString('utf8')));
  }
  if (lower.endsWith('.csv')) {
    return parseCsvBottles(buffer.toString('utf8'));
  }
  throw new Error('Unsupported file format. Use .csv, .json, or .zip');
}
