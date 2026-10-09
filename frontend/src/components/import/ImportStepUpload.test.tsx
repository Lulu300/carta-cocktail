import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStepUpload from './ImportStepUpload';

const mockLoadAsync = vi.fn();

// vi.mock also intercepts the dynamic import('jszip') in the component
vi.mock('jszip', () => ({
  default: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

type ZipEntries = Record<string, { dir: boolean; content: string }>;

function zipWith(entries: ZipEntries) {
  const files = Object.fromEntries(
    Object.entries(entries).map(([name, { dir, content }]) => [
      name,
      { dir, async: vi.fn().mockResolvedValue(content) },
    ]),
  );
  return { files };
}

function recipeJson(name: string) {
  return JSON.stringify({ version: 1, cocktail: { name, ingredients: [], instructions: [] } });
}

const props = {
  onRecipeLoaded: vi.fn(),
  onBatchLoaded: vi.fn(),
  setError: vi.fn(),
  error: null,
  recipe: null,
  recipes: [],
  isLoading: false,
  onNext: vi.fn(),
};

function uploadZip() {
  const { container } = render(<ImportStepUpload {...props} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['zip-bytes'], 'recipes.zip', { type: 'application/zip' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportStepUpload with a ZIP file', () => {
  it('loads every valid recipe of the archive as a batch', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'mojito.json': { dir: false, content: recipeJson('Mojito') },
      'negroni.json': { dir: false, content: recipeJson('Negroni') },
      'broken.json': { dir: false, content: '{not json' },
      'readme.txt': { dir: false, content: 'ignored' },
    }));

    const file = uploadZip();

    await waitFor(() => expect(props.onBatchLoaded).toHaveBeenCalled());
    expect(mockLoadAsync).toHaveBeenCalledWith(file);
    const recipes = props.onBatchLoaded.mock.calls[0][0];
    expect(recipes.map((r: { cocktail: { name: string } }) => r.cocktail.name)).toEqual(['Mojito', 'Negroni']);
    expect(props.onRecipeLoaded).not.toHaveBeenCalled();
  });

  it('loads a single recipe when the archive holds only one', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'mojito.json': { dir: false, content: recipeJson('Mojito') },
    }));

    uploadZip();

    await waitFor(() => expect(props.onRecipeLoaded).toHaveBeenCalled());
    expect(props.onRecipeLoaded.mock.calls[0][0].cocktail.name).toBe('Mojito');
    expect(props.onBatchLoaded).not.toHaveBeenCalled();
  });

  it('reports an archive without JSON files', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'recipes.json': { dir: true, content: '' },
    }));

    uploadZip();

    await waitFor(() => expect(props.setError).toHaveBeenCalledWith('cocktails.importWizard.zipNoRecipes'));
  });

  it('reports an archive without any valid recipe', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'other.json': { dir: false, content: JSON.stringify({ version: 2 }) },
    }));

    uploadZip();

    await waitFor(() => expect(props.setError).toHaveBeenCalledWith('cocktails.importWizard.zipNoValidRecipes'));
  });

  it('reports an unreadable archive', async () => {
    mockLoadAsync.mockRejectedValue(new Error('corrupted'));

    uploadZip();

    await waitFor(() => expect(props.setError).toHaveBeenCalledWith('cocktails.importWizard.zipReadError'));
  });
});
