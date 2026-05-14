/**
 * Serialization helpers for bottle export (JSON + CSV).
 * Identical bottles (same attributes) are aggregated under a single entry
 * with a `quantity` field, matching the import schema.
 */

export const BOTTLE_EXPORT_VERSION = 1;

export interface BottleExportRecord {
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

export interface CategoryExportRecord {
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: Record<string, string> | null;
}

export interface BottlesExportPayload {
  version: number;
  exportedAt: string;
  categories: CategoryExportRecord[];
  bottles: BottleExportRecord[];
}

type BottleWithCategory = {
  name: string;
  capacityMl: number;
  remainingPercent: number;
  alcoholPercentage: number | null;
  purchasePrice: number | null;
  location: string | null;
  openedAt: Date | null;
  isApero: boolean;
  isDigestif: boolean;
  category: {
    name: string;
    type: string;
    desiredStock: number;
    minimumPercent: number;
    nameTranslations: string | null;
  };
};

function aggregateBottles(bottles: BottleWithCategory[]): BottleExportRecord[] {
  const map = new Map<string, BottleExportRecord>();
  for (const b of bottles) {
    const openedAtIso = b.openedAt ? b.openedAt.toISOString() : null;
    const key = [
      b.name, b.category.name, b.capacityMl, b.remainingPercent,
      b.alcoholPercentage ?? '', b.purchasePrice ?? '',
      b.location ?? '', openedAtIso ?? '',
      b.isApero ? '1' : '0', b.isDigestif ? '1' : '0',
    ].join('|');
    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(key, {
        name: b.name,
        categoryName: b.category.name,
        capacityMl: b.capacityMl,
        remainingPercent: b.remainingPercent,
        alcoholPercentage: b.alcoholPercentage,
        purchasePrice: b.purchasePrice,
        location: b.location,
        openedAt: openedAtIso,
        isApero: b.isApero,
        isDigestif: b.isDigestif,
        quantity: 1,
      });
    }
  }
  return Array.from(map.values());
}

function collectCategories(bottles: BottleWithCategory[]): CategoryExportRecord[] {
  const seen = new Map<string, CategoryExportRecord>();
  for (const b of bottles) {
    if (seen.has(b.category.name)) continue;
    let translations: Record<string, string> | null = null;
    if (b.category.nameTranslations) {
      try { translations = JSON.parse(b.category.nameTranslations); }
      catch { translations = null; }
    }
    seen.set(b.category.name, {
      name: b.category.name,
      type: b.category.type,
      desiredStock: b.category.desiredStock,
      minimumPercent: b.category.minimumPercent,
      nameTranslations: translations,
    });
  }
  return Array.from(seen.values());
}

export function buildExportPayload(bottles: BottleWithCategory[]): BottlesExportPayload {
  return {
    version: BOTTLE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    categories: collectCategories(bottles),
    bottles: aggregateBottles(bottles),
  };
}

const CSV_COLUMNS = [
  'name', 'categoryName', 'categoryType', 'capacityMl', 'quantity',
  'remainingPercent', 'alcoholPercentage', 'purchasePrice',
  'location', 'openedAt', 'isApero', 'isDigestif',
] as const;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvPayload(bottles: BottleWithCategory[]): string {
  const records = aggregateBottles(bottles);
  // Build a lookup of categoryName -> type
  const typeByCategoryName = new Map<string, string>();
  for (const b of bottles) {
    if (!typeByCategoryName.has(b.category.name)) {
      typeByCategoryName.set(b.category.name, b.category.type);
    }
  }

  const rows: string[] = [CSV_COLUMNS.join(',')];
  for (const r of records) {
    rows.push([
      escapeCsvField(r.name),
      escapeCsvField(r.categoryName),
      escapeCsvField(typeByCategoryName.get(r.categoryName) ?? ''),
      escapeCsvField(r.capacityMl),
      escapeCsvField(r.quantity),
      escapeCsvField(r.remainingPercent),
      escapeCsvField(r.alcoholPercentage),
      escapeCsvField(r.purchasePrice),
      escapeCsvField(r.location),
      escapeCsvField(r.openedAt),
      escapeCsvField(r.isApero),
      escapeCsvField(r.isDigestif),
    ].join(','));
  }
  return rows.join('\n') + '\n';
}
