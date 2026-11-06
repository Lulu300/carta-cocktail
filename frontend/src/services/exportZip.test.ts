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
import { exportCocktailsAsZip } from './exportZip';
import { mockDownload } from '../test/download';
import { server } from '../test/msw/server';
import { errorResponse } from '../test/msw/utils';
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

/** Exported ids, in the order the server received them. */
let requestedIds: number[];

/** The server names each export file, as the backend does (Content-Disposition). */
function mockServerFiles(...files: { id: number; filename: string; name: string }[]) {
  requestedIds = [];
  server.use(
    http.get('/api/cocktails/:id/export', ({ params }) => {
      const id = Number(params.id);
      requestedIds.push(id);
      const file = files.find((candidate) => candidate.id === id);
      if (!file) return errorResponse(404, 'Cocktail not found');
      return HttpResponse.json(recipe(file.name), {
        headers: { 'Content-Disposition': `attachment; filename="${file.filename}"` },
      });
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

    expect(requestedIds).toEqual([1]);
    expect(mockFile).toHaveBeenCalledWith('cocktail-mojito.json', JSON.stringify(recipe('Mojito'), null, 2));
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });

  it('should export multiple cocktails', async () => {
    mockServerFiles(
      { id: 1, filename: 'cocktail-mojito.json', name: 'Mojito' },
      { id: 2, filename: 'cocktail-negroni.json', name: 'Negroni' },
    );

    await exportCocktailsAsZip([1, 2]);

    expect(requestedIds).toHaveLength(2);
    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-negroni.json']);
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
