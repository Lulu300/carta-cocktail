import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { CocktailExportFormat, ImportPreviewResponse } from '../../types';
import ImportCocktailWizard from './ImportCocktailWizard';

vi.mock('../../services/api', () => ({
  cocktails: { importPreview: vi.fn(), importConfirm: vi.fn() },
  units: { list: vi.fn() },
  categories: { list: vi.fn() },
  bottles: { list: vi.fn() },
  ingredients: { list: vi.fn() },
  categoryTypes: { list: vi.fn() },
}));

const mockLoadAsync = vi.fn();

// vi.mock also intercepts the dynamic import('jszip') of the upload step
vi.mock('jszip', () => ({
  default: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

import * as api from '../../services/api';

const LIST_CALLS = [api.units.list, api.categories.list, api.bottles.list, api.ingredients.list, api.categoryTypes.list];

function recipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    cocktail: { name, description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  };
}

/** A recipe whose only dependency is a rum the backend already knows. */
function matchedPreview(name: string): ImportPreviewResponse {
  return {
    cocktail: { name, description: null, tags: [], alreadyExists: false },
    units: [],
    categories: [{ ref: { name: 'Rhum' }, existingMatch: { id: 10, name: 'Rhum' }, status: 'matched' }],
    bottles: [],
    ingredients: [],
  };
}

const bottleToCreatePreview: ImportPreviewResponse = {
  ...matchedPreview('Daiquiri'),
  bottles: [{ ref: { name: 'Havana 3', categoryName: 'Rhum' }, existingMatch: null, status: 'missing' }],
};

function nameOf(recipeToPreview: CocktailExportFormat): string {
  return recipeToPreview.cocktail.name;
}

function uploadJson(recipeToLoad: CocktailExportFormat) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(recipeToLoad)], 'recipe.json', { type: 'application/json' })] } });
}

function uploadZip(names: string[]) {
  const files = Object.fromEntries(names.map((name) => [
    `${name}.json`,
    { dir: false, async: vi.fn().mockResolvedValue(JSON.stringify(recipe(name))) },
  ]));
  mockLoadAsync.mockResolvedValue({ files });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['zip'], 'recipes.zip', { type: 'application/zip' })] } });
}

function containsNaN(value: unknown): boolean {
  if (typeof value === 'number') return Number.isNaN(value);
  if (value && typeof value === 'object') return Object.values(value).some(containsNaN);
  return false;
}

const user = userEvent.setup();

async function goToConfirmation() {
  await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
  await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
}

/** From the resolve step of the next recipe of a batch. */
async function goToConfirmationFromResolve() {
  await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
}

async function confirmImport() {
  await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.confirmImport' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of LIST_CALLS) vi.mocked(list).mockResolvedValue([]);
  vi.mocked(api.categories.list).mockResolvedValue([{ id: 10, name: 'Rhum' }] as never);
  vi.mocked(api.cocktails.importPreview).mockImplementation(async (r) => matchedPreview(nameOf(r)));
  let nextId = 100;
  vi.mocked(api.cocktails.importConfirm).mockImplementation(async ({ recipe: r }) => ({ id: nextId++, name: nameOf(r) }) as never);
});

describe('ImportCocktailWizard', () => {
  it('imports a single JSON recipe and sends no NaN', async () => {
    vi.mocked(api.cocktails.importPreview).mockResolvedValue(bottleToCreatePreview);
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Daiquiri'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));

    // The capacity of the bottle to create is emptied: the import is blocked
    const capacity = await screen.findByLabelText(/bottles\.capacityMl/);
    await user.clear(capacity);
    expect(screen.getByRole('button', { name: 'cocktails.importWizard.next' })).toBeDisabled();
    expect(screen.getByText('cocktails.importWizard.unresolvedCount')).toBeInTheDocument();

    await user.type(capacity, '750');
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.next' }));
    await confirmImport();

    expect(await screen.findByText('cocktails.importWizard.success')).toBeInTheDocument();
    const body = vi.mocked(api.cocktails.importConfirm).mock.calls[0][0];
    expect(containsNaN(body)).toBe(false);
    expect(body.resolutions.bottles['havana 3']).toEqual({
      action: 'create',
      data: { name: 'Havana 3', categoryName: 'Rhum', capacityMl: 750, remainingPercent: 100 },
    });
    expect(screen.getByRole('link', { name: 'cocktails.importWizard.editImported' })).toHaveAttribute('href', '/admin/cocktails/100');
  });

  it('blocks the import while the name of an entity to create is empty', async () => {
    vi.mocked(api.cocktails.importPreview).mockResolvedValue(bottleToCreatePreview);
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Daiquiri'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    const name = await screen.findByLabelText(/bottles\.name/);
    await user.clear(name);

    expect(name).toHaveValue('');
    expect(screen.getByRole('button', { name: 'cocktails.importWizard.next' })).toBeDisabled();
  });

  it('refreshes the lists after a confirmation that created an entity', async () => {
    vi.mocked(api.cocktails.importPreview).mockResolvedValue(bottleToCreatePreview);
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Daiquiri'));
    await goToConfirmation();
    await confirmImport();

    await waitFor(() => expect(api.bottles.list).toHaveBeenCalledTimes(2));
  });

  it('imports a batch where the second recipe fails once: one line per recipe, all imported', async () => {
    let confirmations = 0;
    vi.mocked(api.cocktails.importConfirm).mockImplementation(async ({ recipe: r }) => {
      confirmations += 1;
      if (confirmations === 2) throw new Error('Boom');
      return { id: confirmations, name: nameOf(r) } as never;
    });
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadZip(['Mojito', 'Negroni', 'Daiquiri']);
    await screen.findByText('cocktails.importWizard.batchPreview');
    await goToConfirmation();
    await confirmImport();

    // Negroni fails, then succeeds on retry
    await goToConfirmationFromResolve();
    await confirmImport();
    expect(await screen.findByText('cocktails.importWizard.batchItemError')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.tryAgain' }));
    await goToConfirmationFromResolve();
    await confirmImport();

    await goToConfirmationFromResolve();
    await confirmImport();

    expect(await screen.findByText('cocktails.importWizard.batchComplete')).toBeInTheDocument();
    const lines = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining('Mojito'),
      expect.stringContaining('Negroni'),
      expect.stringContaining('Daiquiri'),
    ]);
    expect(screen.getAllByText('cocktails.importWizard.resultImported')).toHaveLength(3);
    expect(api.cocktails.importConfirm).toHaveBeenCalledTimes(4);
  });

  it('shows an error screen with buttons when the preview of the next recipe fails', async () => {
    vi.mocked(api.cocktails.importPreview).mockImplementation(async (r) => {
      if (nameOf(r) === 'Negroni') throw new Error('Invalid recipe');
      return matchedPreview(nameOf(r));
    });
    const onClose = vi.fn();
    render(<ImportCocktailWizard onClose={onClose} />);

    uploadZip(['Mojito', 'Negroni']);
    await screen.findByText('cocktails.importWizard.batchPreview');
    await goToConfirmation();
    await confirmImport();

    expect(await screen.findByText('Invalid recipe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cocktails.importWizard.back' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'cocktails.importWizard.close' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.showSummary' }));
    expect(await screen.findByText('cocktails.importWizard.batchComplete')).toBeInTheDocument();
    expect(screen.getAllByText('cocktails.importWizard.resultImported')).toHaveLength(1);
    expect(screen.getAllByText('cocktails.importWizard.resultNotImported')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('loads the lists once for a batch of 10 recipes, however long it takes', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `Cocktail ${i + 1}`);
    // The app's stale time (createQueryClient): a step that loaded the lists on
    // each mount would reload them once the cache has gone stale
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    render(<ImportCocktailWizard onClose={vi.fn()} />, { queryClient });

    try {
      uploadZip(names);
      await screen.findByText('cocktails.importWizard.batchPreview');
      await goToConfirmation();
      await confirmImport();
      for (let i = 1; i < names.length; i++) {
        vi.setSystemTime(Date.now() + 31_000);
        await goToConfirmationFromResolve();
        await confirmImport();
      }

      expect(await screen.findByText('cocktails.importWizard.batchComplete')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    expect(api.cocktails.importConfirm).toHaveBeenCalledTimes(10);
    for (const list of LIST_CALLS) expect(list).toHaveBeenCalledTimes(1);
  });

  it('goes back to the file from the first recipe, and after a failed preview', async () => {
    vi.mocked(api.cocktails.importPreview).mockRejectedValueOnce(new Error('Server down'));
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Mojito'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.back' }));

    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.back' }));
    expect(await screen.findByText('cocktails.importWizard.dropzone')).toBeInTheDocument();
  });

  it('retries a failed preview', async () => {
    vi.mocked(api.cocktails.importPreview).mockRejectedValueOnce(new Error('Server down'));
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Mojito'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.tryAgain' }));

    expect(await screen.findByText('cocktails.importWizard.allResolved')).toBeInTheDocument();
  });

  it('warns when an existing list cannot be loaded', async () => {
    vi.mocked(api.ingredients.list).mockRejectedValue(new Error('Down'));
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Mojito'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));

    expect(await screen.findByText('cocktails.importWizard.listsLoadError')).toBeInTheDocument();
  });

  it('closes from the error screen of a single recipe', async () => {
    vi.mocked(api.cocktails.importConfirm).mockRejectedValue('not an Error');
    const onClose = vi.fn();
    render(<ImportCocktailWizard onClose={onClose} />);

    uploadJson(recipe('Mojito'));
    await goToConfirmation();
    await confirmImport();

    expect(await screen.findByText('cocktails.importWizard.error')).toBeInTheDocument();
    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cocktails.importWizard.skipRecipe' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
