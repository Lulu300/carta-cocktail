import { describe, it, expect } from 'vitest';
import { buildCsvPayload, protectFormula, unprotectFormula, UTF8_BOM } from './bottlesExport';
import { parseCsvBottles } from './bottlesImport';

type ExportedBottle = Parameters<typeof buildCsvPayload>[0][number];

function bottle(fields: Partial<ExportedBottle> = {}): ExportedBottle {
  return {
    name: 'Havana 7',
    capacityMl: 700,
    remainingPercent: 100,
    alcoholPercentage: null,
    purchasePrice: null,
    location: null,
    openedAt: null,
    isApero: false,
    isDigestif: false,
    category: { name: 'Rhum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null },
    ...fields,
  };
}

function dataRows(csv: string): string[] {
  return csv.slice(UTF8_BOM.length).trim().split('\n').slice(1);
}

describe('protectFormula', () => {
  it.each(['=1+1', '+33 6', '-cellar', '@SUM(A1)', '\tTab', '\rReturn'])(
    'prefixes %j with an apostrophe, and unprotectFormula removes it',
    (text) => {
      expect(protectFormula(text)).toBe(`'${text}`);
      expect(unprotectFormula(protectFormula(text))).toBe(text);
    },
  );

  it('leaves other text alone, an apostrophe included', () => {
    expect(protectFormula('Havana 7')).toBe('Havana 7');
    expect(unprotectFormula("'Havana")).toBe("'Havana");
  });
});

describe('buildCsvPayload', () => {
  it('starts with a UTF-8 byte order mark, so that Excel keeps the accents', () => {
    const csv = buildCsvPayload([bottle({ name: 'Liqueur de châtaigne' })]);
    expect(csv.startsWith(`${UTF8_BOM}name,categoryName,`)).toBe(true);
  });

  it('exports a bottle named =1+1 as text', () => {
    const [row] = dataRows(buildCsvPayload([bottle({ name: '=1+1' })]));
    expect(row.startsWith("'=1+1,Rhum,")).toBe(true);
  });

  it('does not prefix a negative number', () => {
    const [row] = dataRows(buildCsvPayload([bottle({ purchasePrice: -5 })]));
    expect(row).toContain(',-5,');
    expect(row).not.toContain("'");
  });

  it('imports back the same bottles', () => {
    const bottles = [
      bottle({ name: '=1+1', location: '-1 cellar, left', alcoholPercentage: 40.5, purchasePrice: 0 }),
      bottle({ name: 'Château "Margaux"', openedAt: new Date('2026-10-11T00:00:00.000Z'), isApero: true }),
      bottle({ name: 'Château "Margaux"', openedAt: new Date('2026-10-11T00:00:00.000Z'), isApero: true }),
    ];

    const payload = parseCsvBottles(buildCsvPayload(bottles));

    expect(payload.errors).toEqual([]);
    expect(payload.bottles).toEqual([
      {
        name: '=1+1', categoryName: 'Rhum', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: 40.5, purchasePrice: 0, location: '-1 cellar, left', openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      },
      {
        name: 'Château "Margaux"', categoryName: 'Rhum', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: null, purchasePrice: null, location: null, openedAt: '2026-10-11T00:00:00.000Z',
        isApero: true, isDigestif: false, quantity: 2,
      },
    ]);
  });
});
