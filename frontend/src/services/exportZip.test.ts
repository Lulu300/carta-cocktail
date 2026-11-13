import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock JSZip as a class constructor
const mockFile = vi.fn();
const mockGenerateAsync = vi.fn();

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
    },
  };
});

import { http, HttpResponse } from 'msw';
import { EXPORT_BATCH_SIZE, exportCocktailsAsZip } from './exportZip';
import { mockDownload } from '../test/download';
import { server } from '../test/msw/server';
import { errorResponse, readJsonObject } from '../test/msw/utils';
import type { CocktailExportFormat } from '../types';

let downloads: string[];

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAsync.mockResolvedValue(new Blob(['zip-content']));
  downloads = mockDownload();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function recipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2024-01-01',
    cocktail: { name, description: null, notes: null, tags: ['rum'], ingredients: [], instructions: [] },
  };
}

/** The ids of each batch export request, in the order the server received them. */
let requestedBatches: number[][];

/** The server names each export file, as the backend does, and refuses a batch with an unknown id. */
function mockServerFiles(...files: { id: number; filename: string; name: string }[]) {
  requestedBatches = [];
  server.use(
    http.post('/api/cocktails/export', async ({ request }) => {
      const { ids } = await readJsonObject(request);
      const batch = Array.isArray(ids) ? ids.map(Number) : [];
      requestedBatches.push(batch);
      const found = batch.map((id) => files.find((candidate) => candidate.id === id));
      if (found.some((file) => !file)) return errorResponse(404, 'Resource not found');
      return HttpResponse.json(found.map((file) => file && { filename: file.filename, data: recipe(file.name) }));
    }),
  );
}

function zippedFilenames(): string[] {
  return mockFile.mock.calls.map(([filename]) => filename);
}

describe('exportCocktailsAsZip', () => {
  it('should export single cocktail as zip under the server file name', async () => {
    mockServerFiles({ id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(requestedBatches).toEqual([[1]]);
    expect(mockFile).toHaveBeenCalledWith('cocktail-mojito.json', JSON.stringify(recipe('Mojito'), null, 2));
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });

  it('should export multiple cocktails', async () => {
    mockServerFiles(
      { id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 2, filename: 'cocktail-negroni.json', name: 'Negroni' },
    );

    await exportCocktailsAsZip([2, 1]);

    expect(requestedBatches).toEqual([[2, 1]]);
    expect(zippedFilenames()).toEqual(['cocktail-negroni.json', 'cocktail-mojito.json']);
  });

  it(`should split a selection of more than ${EXPORT_BATCH_SIZE} cocktails into batches, keeping its order`, async () => {
    const ids = Array.from({ length: EXPORT_BATCH_SIZE + 1 }, (_, index) => EXPORT_BATCH_SIZE + 1 - index);
    mockServerFiles(...ids.map((id) => ({ id, filename: `cocktail-${id}.json`, name: `Cocktail ${id}` })));

    await exportCocktailsAsZip(ids);

    expect(requestedBatches.map((batch) => batch.length)).toEqual([EXPORT_BATCH_SIZE, 1]);
    expect(requestedBatches.flat()).toEqual(ids);
    expect(zippedFilenames()).toEqual(ids.map((id) => `cocktail-${id}.json`));
  });

  it('should fail without downloading anything when a cocktail no longer exists', async () => {
    mockServerFiles({ id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' });

    await expect(exportCocktailsAsZip([1, 99])).rejects.toThrow('Resource not found');

    expect(mockGenerateAsync).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });

  it('should keep one file per cocktail when names collide', async () => {
    mockServerFiles(
      { id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 2, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 3, filename: 'cocktail-mojito.json', name: 'mojito' },
    );

    await exportCocktailsAsZip([1, 2, 3]);

    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-mojito-2.json', 'cocktail-mojito-3.json']);
  });

  it('should build an archive that holds every recipe of a batch with duplicate names', async () => {
    mockServerFiles(
      { id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 2, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 42, filename: 'cocktail-42.json', name: 'モヒート' },
    );

    await exportCocktailsAsZip([1, 2, 42]);

    // Replays the entries into a real archive and reads it back like the import step does
    const { default: RealJSZip } = await vi.importActual<{ default: typeof import('jszip') }>('jszip');
    const archive = new RealJSZip();
    for (const [filename, content] of mockFile.mock.calls) archive.file(filename, content);
    const reloaded = await RealJSZip.loadAsync(await archive.generateAsync({ type: 'uint8array' }));
    const recipes = Object.keys(reloaded.files).filter((name) => name.endsWith('.json'));
    expect(recipes).toHaveLength(3);
  });

  it('should not reuse a suffixed name already taken by another cocktail', async () => {
    mockServerFiles(
      { id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 2, filename: 'cocktail-mojito-2.json', name: 'Mojito 2' },
      { id: 3, filename: 'cocktail-mojito.json', name: 'Mojito' },
    );

    await exportCocktailsAsZip([1, 2, 3]);

    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-mojito-2.json', 'cocktail-mojito-3.json']);
  });

  it('should keep the id-based name of a cocktail with no latin letter', async () => {
    mockServerFiles({ id: 42, filename: 'cocktail-42.json', name: 'モヒート' });

    await exportCocktailsAsZip([42]);

    expect(zippedFilenames()).toEqual(['cocktail-42.json']);
  });

  it('should create download link with correct filename format', async () => {
    mockServerFiles({ id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^cocktails-export-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('should clean up object URL after download', async () => {
    mockServerFiles({ id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});
