import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock the API
vi.mock('./api', () => ({
  cocktails: { exportRecipe: vi.fn() },
}));

import { exportCocktailsAsZip } from './exportZip';
import { cocktails as cocktailsApi } from './api';
import type { CocktailExportFormat } from '../types';

let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAsync.mockResolvedValue(new Blob(['zip-content']));

  // Mock DOM APIs
  global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
  global.URL.revokeObjectURL = vi.fn();

  // Mock document.createElement and body methods
  mockAnchor = { href: '', download: '', click: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
});

function recipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2024-01-01',
    cocktail: { name, description: null, notes: null, tags: ['rum'], ingredients: [], instructions: [] },
  };
}

/** Each call to the API answers with the next file name, as the backend would. */
function mockServerFiles(...files: { filename: string; name: string }[]) {
  for (const { filename, name } of files) {
    vi.mocked(cocktailsApi.exportRecipe).mockResolvedValueOnce({ filename, data: recipe(name) });
  }
}

function zippedFilenames(): string[] {
  return mockFile.mock.calls.map(([filename]) => filename);
}

describe('exportCocktailsAsZip', () => {
  it('should export single cocktail as zip under the server file name', async () => {
    mockServerFiles({ filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(cocktailsApi.exportRecipe).toHaveBeenCalledWith(1);
    expect(mockFile).toHaveBeenCalledWith('cocktail-mojito.json', JSON.stringify(recipe('Mojito'), null, 2));
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });

  it('should export multiple cocktails', async () => {
    mockServerFiles(
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-negroni.json', name: 'Negroni' },
    );

    await exportCocktailsAsZip([1, 2]);

    expect(cocktailsApi.exportRecipe).toHaveBeenCalledTimes(2);
    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-negroni.json']);
  });

  it('should keep one file per cocktail when names collide', async () => {
    mockServerFiles(
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-mojito.json', name: 'mojito' },
    );

    await exportCocktailsAsZip([1, 2, 3]);

    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-mojito-2.json', 'cocktail-mojito-3.json']);
  });

  it('should build an archive that holds every recipe of a batch with duplicate names', async () => {
    mockServerFiles(
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-42.json', name: 'モヒート' },
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
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
      { filename: 'cocktail-mojito-2.json', name: 'Mojito 2' },
      { filename: 'cocktail-mojito.json', name: 'Mojito' },
    );

    await exportCocktailsAsZip([1, 2, 3]);

    expect(zippedFilenames()).toEqual(['cocktail-mojito.json', 'cocktail-mojito-2.json', 'cocktail-mojito-3.json']);
  });

  it('should keep the id-based name of a cocktail with no latin letter', async () => {
    mockServerFiles({ filename: 'cocktail-42.json', name: 'モヒート' });

    await exportCocktailsAsZip([42]);

    expect(zippedFilenames()).toEqual(['cocktail-42.json']);
  });

  it('should create download link with correct filename format', async () => {
    mockServerFiles({ filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(mockAnchor.download).toMatch(/^cocktails-export-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('should clean up object URL after download', async () => {
    mockServerFiles({ filename: 'cocktail-mojito.json', name: 'Mojito' });

    await exportCocktailsAsZip([1]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
