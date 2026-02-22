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
import type { Cocktail } from '../types';

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

const mockExport = {
  version: 1,
  exportedAt: '2024-01-01',
  cocktail: { name: 'Mojito', description: null, notes: null, tags: ['rum'], ingredients: [], instructions: [] },
};

const mockCocktails: Cocktail[] = [
  { id: 1, name: 'Mojito', description: 'Classic', notes: null, imagePath: null, tags: 'rum', isAvailable: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 2, name: 'Negroni', description: null, notes: null, imagePath: null, tags: '', isAvailable: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

describe('exportCocktailsAsZip', () => {
  it('should export single cocktail as zip', async () => {
    vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue(mockExport as never);

    await exportCocktailsAsZip([1], [mockCocktails[0]]);

    expect(cocktailsApi.exportRecipe).toHaveBeenCalledWith(1);
    expect(mockFile).toHaveBeenCalledWith('cocktail-mojito.json', expect.any(String));
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });

  it('should export multiple cocktails', async () => {
    vi.mocked(cocktailsApi.exportRecipe)
      .mockResolvedValueOnce(mockExport as never)
      .mockResolvedValueOnce({ ...mockExport, cocktail: { ...mockExport.cocktail, name: 'Negroni' } } as never);

    await exportCocktailsAsZip([1, 2], mockCocktails);

    expect(cocktailsApi.exportRecipe).toHaveBeenCalledTimes(2);
    expect(mockFile).toHaveBeenCalledTimes(2);
  });

  it('should create download link with correct filename format', async () => {
    vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue(mockExport as never);

    await exportCocktailsAsZip([1], [mockCocktails[0]]);

    expect(mockAnchor.download).toMatch(/^cocktails-export-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('should slugify cocktail names for filenames', async () => {
    const exportData = { ...mockExport, cocktail: { ...mockExport.cocktail, name: 'Old Fashioned!' } };
    vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue(exportData as never);
    const cocktail = { ...mockCocktails[0], name: 'Old Fashioned!' };

    await exportCocktailsAsZip([1], [cocktail]);

    expect(mockFile).toHaveBeenCalledWith('cocktail-old-fashioned.json', expect.any(String));
  });

  it('should clean up object URL after download', async () => {
    vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue(mockExport as never);

    await exportCocktailsAsZip([1], [mockCocktails[0]]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
