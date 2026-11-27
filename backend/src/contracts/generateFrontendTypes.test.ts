import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { GENERATED_FILE, generateFrontendTypes, printTypeAliases } from './generateFrontendTypes';

const VIRTUAL_FILE = '/virtual/contracts.ts';

/** The declarations printed for a source file that exists in memory only. */
function printSource(source: string): string[] {
  const options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ES2020 };
  const host = ts.createCompilerHost(options);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    fileName === VIRTUAL_FILE
      ? ts.createSourceFile(fileName, source, languageVersion)
      : readSourceFile(fileName, languageVersion, ...rest);
  return printTypeAliases(ts.createProgram([VIRTUAL_FILE], options, host), VIRTUAL_FILE);
}

describe('frontend/src/types/generated.ts', () => {
  it('is up to date with the schemas: run `npm run contracts:generate` in backend/ otherwise', async () => {
    const expected = await generateFrontendTypes();

    expect(readFileSync(GENERATED_FILE, 'utf8')).toBe(expected);
  });
});

describe('printTypeAliases', () => {
  it('prints the primitives, the literals and the nullable values', () => {
    expect(
      printSource(`export type Value = {
        text: string;
        count: number;
        flag: boolean;
        kind: 'a' | 'b';
        level: 1 | 2;
        on: true;
        note: string | null;
        extra: unknown;
      };`),
    ).toEqual([
      'export type Value = {\n' +
        'text: string;\n' +
        'count: number;\n' +
        'flag: boolean;\n' +
        'kind: "a" | "b";\n' +
        'level: 1 | 2;\n' +
        'on: true;\n' +
        'note: string | null;\n' +
        'extra: unknown;\n' +
        '};',
    ]);
  });

  it('prints optional properties without undefined, and keeps the boolean of a union', () => {
    expect(printSource(`export type Value = { flag?: boolean; name?: string | null };`)).toEqual([
      'export type Value = {\nflag?: boolean;\nname?: string | null;\n};',
    ]);
  });

  it('prints records, arrays and arrays of unions, and quotes keys that are not identifiers', () => {
    expect(
      printSource(`export type Value = {
        names: Record<string, string>;
        ids: number[];
        steps: (string | { text: string })[];
        'two words': string;
      };`),
    ).toEqual([
      'export type Value = {\n' +
        'names: Record<string, string>;\n' +
        'ids: number[];\n' +
        'steps: (string | {\ntext: string;\n})[];\n' +
        '"two words": string;\n' +
        '};',
    ]);
  });

  it('prints an exported type by its name, a union included, and keeps the property comments', () => {
    expect(
      printSource(`export type Kind = 'a' | 'b';
        export type Item = { id: number };
        export type List = {
          /** The items, in order. */
          items: Item[];
          kind?: 'a' | 'b';
        };`),
    ).toEqual([
      'export type Kind = "a" | "b";',
      'export type Item = {\nid: number;\n};',
      'export type List = {\n/** The items, in order. */\nitems: Item[];\nkind?: Kind;\n};',
    ]);
  });

  it('refuses the types the frontend file cannot hold', () => {
    expect(() => printSource('export type Value = { run: () => void };')).toThrow(
      'Unsupported type: () => void',
    );
    expect(() => printSource('export type Value = { id: number; [key: string]: number };')).toThrow(
      'Unsupported index signature',
    );
  });

  it('refuses a file the program does not hold', () => {
    const program = ts.createProgram([], {});

    expect(() => printTypeAliases(program, VIRTUAL_FILE)).toThrow(`Cannot read ${VIRTUAL_FILE}`);
  });
});
