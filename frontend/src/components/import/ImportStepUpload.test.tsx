import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
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
  onLoaded: vi.fn(),
  recipes: [],
  onNext: vi.fn(),
};

function upload(file: File) {
  const { container } = render(<ImportStepUpload {...props} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function uploadZip() {
  return upload(new File(['zip-bytes'], 'recipes.zip', { type: 'application/zip' }));
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

    await waitFor(() => expect(props.onLoaded).toHaveBeenCalled());
    expect(mockLoadAsync).toHaveBeenCalledWith(file);
    const recipes = props.onLoaded.mock.calls[0][0];
    expect(recipes.map((r: { cocktail: { name: string } }) => r.cocktail.name)).toEqual(['Mojito', 'Negroni']);
  });

  it('loads a single recipe when the archive holds only one', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'mojito.json': { dir: false, content: recipeJson('Mojito') },
    }));

    uploadZip();

    await waitFor(() => expect(props.onLoaded).toHaveBeenCalled());
    expect(props.onLoaded.mock.calls[0][0]).toHaveLength(1);
    expect(props.onLoaded.mock.calls[0][0][0].cocktail.name).toBe('Mojito');
  });

  it('reports an archive without JSON files', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'recipes.json': { dir: true, content: '' },
    }));

    uploadZip();

    expect(await screen.findByText('cocktails.importWizard.zipNoRecipes')).toBeInTheDocument();
  });

  it('reports an archive without any valid recipe', async () => {
    mockLoadAsync.mockResolvedValue(zipWith({
      'other.json': { dir: false, content: JSON.stringify({ version: 2 }) },
    }));

    uploadZip();

    expect(await screen.findByText('cocktails.importWizard.zipNoValidRecipes')).toBeInTheDocument();
  });

  it('reports an unreadable archive', async () => {
    mockLoadAsync.mockRejectedValue(new Error('corrupted'));

    uploadZip();

    expect(await screen.findByText('cocktails.importWizard.zipReadError')).toBeInTheDocument();
  });
});

describe('ImportStepUpload with a JSON file', () => {
  it('loads a valid recipe', async () => {
    upload(new File([recipeJson('Mojito')], 'mojito.json', { type: 'application/json' }));

    await waitFor(() => expect(props.onLoaded).toHaveBeenCalled());
    expect(props.onLoaded.mock.calls[0][0][0].cocktail.name).toBe('Mojito');
  });

  it.each([
    ['without ingredients', { version: 1, cocktail: { name: 'Mojito', instructions: [] } }],
    ['without instructions', { version: 1, cocktail: { name: 'Mojito', ingredients: [] } }],
    ['with another version', { version: 2, cocktail: { name: 'Mojito', ingredients: [], instructions: [] } }],
    ['without a name', { version: 1, cocktail: { ingredients: [], instructions: [] } }],
  ])('refuses a recipe %s', async (_case, recipe) => {
    upload(new File([JSON.stringify(recipe)], 'recipe.json', { type: 'application/json' }));

    expect(await screen.findByText('cocktails.importWizard.invalidFile')).toBeInTheDocument();
    expect(props.onLoaded).not.toHaveBeenCalled();
  });

  it('refuses a file that is not JSON', async () => {
    upload(new File(['{not json'], 'recipe.json', { type: 'application/json' }));

    expect(await screen.findByText('cocktails.importWizard.invalidFile')).toBeInTheDocument();
  });

  it('reports a file the browser cannot read', async () => {
    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
    });

    upload(new File(['{}'], 'recipe.json', { type: 'application/json' }));

    expect(await screen.findByText('cocktails.importWizard.fileReadError')).toBeInTheDocument();
    expect(props.onLoaded).not.toHaveBeenCalled();
    readAsText.mockRestore();
  });

  it('keeps showing the name of the loaded file when the next one is refused', async () => {
    const { container } = render(<ImportStepUpload {...props} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File([recipeJson('Mojito')], 'mojito.json', { type: 'application/json' })] } });
    expect(await screen.findByText('mojito.json')).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [new File(['{not json'], 'broken.json', { type: 'application/json' })] } });
    expect(await screen.findByText('cocktails.importWizard.invalidFile')).toBeInTheDocument();
    expect(screen.getByText('mojito.json')).toBeInTheDocument();
    expect(screen.queryByText('broken.json')).not.toBeInTheDocument();
  });

  it('refuses an extension other than .json and .zip', async () => {
    upload(new File(['x'], 'recipe.txt', { type: 'text/plain' }));

    expect(await screen.findByText('cocktails.importWizard.invalidFile')).toBeInTheDocument();
  });
});

describe('ImportStepUpload preview', () => {
  const recipe = (name: string) => JSON.parse(recipeJson(name));

  it('shows a single recipe and asks for the next step', () => {
    const onNext = vi.fn();
    render(<ImportStepUpload {...props} recipes={[{ ...recipe('Mojito'), cocktail: { ...recipe('Mojito').cocktail, tags: ['rum'], description: 'Fresh' } }]} onNext={onNext} />);

    expect(screen.getByText('Mojito')).toBeInTheDocument();
    expect(screen.getByText('rum')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cocktails.importWizard.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('lists every recipe of a batch', () => {
    render(<ImportStepUpload {...props} recipes={[recipe('Mojito'), recipe('Negroni')]} />);

    expect(screen.getByText('cocktails.importWizard.batchPreview')).toBeInTheDocument();
    expect(screen.getByText('Mojito')).toBeInTheDocument();
    expect(screen.getByText('Negroni')).toBeInTheDocument();
  });
});
