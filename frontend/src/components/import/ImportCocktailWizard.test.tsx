import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, fireEvent, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { createQueryClient } from '../../queries/queryClient';
import { buildCategory, buildCocktail } from '../../test/factories';
import { server } from '../../test/msw/server';
import {
  captureRequest,
  errorResponse,
  mockApiError,
  mockApiResponse,
  rejectNextFetch,
  type CapturedRequest,
} from '../../test/msw/utils';
import type { CocktailExportFormat, EntityResolutionAction, ImportPreviewResponse } from '../../types';
import ImportCocktailWizard from './ImportCocktailWizard';

const mockLoadAsync = vi.fn();

// vi.mock also intercepts the dynamic import('jszip') of the upload step
vi.mock('jszip', () => ({
  default: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

/** The lists of existing entities the resolve step matches the recipe against. */
const LIST_PATHS = ['/api/units', '/api/categories', '/api/bottles', '/api/ingredients', '/api/category-types'];

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

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
}

function uploadJson(recipeToLoad: CocktailExportFormat) {
  fireEvent.change(fileInput(), { target: { files: [new File([JSON.stringify(recipeToLoad)], 'recipe.json', { type: 'application/json' })] } });
}

function uploadZip(names: string[]) {
  const files = Object.fromEntries(names.map((name) => [
    `${name}.json`,
    { dir: false, async: vi.fn().mockResolvedValue(JSON.stringify(recipe(name))) },
  ]));
  mockLoadAsync.mockResolvedValue({ files });
  fireEvent.change(fileInput(), { target: { files: [new File(['zip'], 'recipes.zip', { type: 'application/zip' })] } });
}

// --- Fake backend: previews and confirmations answer per recipe name ---

interface ImportConfirmation {
  recipe: CocktailExportFormat;
  resolutions: Record<string, Record<string, EntityResolutionAction>>;
}

function isRecipe(body: unknown): body is CocktailExportFormat {
  return typeof body === 'object' && body !== null && 'cocktail' in body;
}

function isConfirmation(body: unknown): body is ImportConfirmation {
  return typeof body === 'object' && body !== null && 'recipe' in body && isRecipe(body.recipe) && 'resolutions' in body;
}

/** Confirmations received, in order. */
let confirmations: ImportConfirmation[];
/** How the server answers the preview of a recipe, by name. */
let answerPreview: (name: string) => Response;
/** How the server answers a confirmation; `attempt` counts from 1. */
let answerConfirm: (name: string, attempt: number) => Response;
let listReads: CapturedRequest[];

/** The first preview fails with `message`, the next ones answer as usual. */
function failFirstPreview(message: string) {
  answerPreview = () => {
    answerPreview = (name) => HttpResponse.json(matchedPreview(name));
    return errorResponse(503, message);
  };
}

function installFakeBackend() {
  confirmations = [];
  answerPreview = (name) => HttpResponse.json(matchedPreview(name));
  answerConfirm = (name, attempt) => HttpResponse.json(buildCocktail({ id: 99 + attempt, name }));
  mockApiResponse('get', '/api/units', []);
  mockApiResponse('get', '/api/categories', [buildCategory({ id: 10, name: 'Rhum' })]);
  mockApiResponse('get', '/api/bottles', []);
  mockApiResponse('get', '/api/ingredients', []);
  mockApiResponse('get', '/api/category-types', []);
  listReads = LIST_PATHS.map((path) => captureRequest('get', path));
  server.use(
    http.post('/api/cocktails/import/preview', async ({ request }) => {
      const body: unknown = await request.json();
      return isRecipe(body) ? answerPreview(nameOf(body)) : errorResponse(400, 'Invalid recipe');
    }),
    http.post('/api/cocktails/import/confirm', async ({ request }) => {
      const body: unknown = await request.json();
      if (!isConfirmation(body)) return errorResponse(400, 'Invalid confirmation');
      confirmations.push(body);
      return answerConfirm(nameOf(body.recipe), confirmations.length);
    }),
  );
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
  mockLoadAsync.mockReset();
  installFakeBackend();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImportCocktailWizard', () => {
  it('imports a single JSON recipe and sends no NaN', async () => {
    answerPreview = () => HttpResponse.json(bottleToCreatePreview);
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
    // JSON turns a NaN into null: every number of the resolutions must come out as sent
    expect(confirmations[0].resolutions.bottles).toEqual({
      'havana 3': {
        action: 'create',
        data: { name: 'Havana 3', categoryName: 'Rhum', capacityMl: 750, remainingPercent: 100 },
      },
    });
    expect(JSON.stringify(confirmations[0].resolutions)).not.toContain('null');
    expect(screen.getByRole('link', { name: 'cocktails.importWizard.editImported' })).toHaveAttribute('href', '/admin/cocktails/100');
  });

  it('blocks the import while the name of an entity to create is empty', async () => {
    answerPreview = () => HttpResponse.json(bottleToCreatePreview);
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Daiquiri'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    const name = await screen.findByLabelText(/bottles\.name/);
    await user.clear(name);

    expect(name).toHaveValue('');
    expect(screen.getByRole('button', { name: 'cocktails.importWizard.next' })).toBeDisabled();
  });

  it('refreshes the lists after a confirmation that created an entity', async () => {
    answerPreview = () => HttpResponse.json(bottleToCreatePreview);
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Daiquiri'));
    await goToConfirmation();
    await confirmImport();

    const bottlesRead = listReads[LIST_PATHS.indexOf('/api/bottles')];
    await waitFor(() => expect(bottlesRead.count()).toBe(2));
  });

  it('imports a batch where the second recipe fails once: one line per recipe, all imported', async () => {
    answerConfirm = (name, attempt) => (attempt === 2 ? errorResponse(500, 'Boom') : HttpResponse.json(buildCocktail({ id: attempt, name })));
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
    expect(confirmations.map((confirmation) => nameOf(confirmation.recipe))).toEqual(['Mojito', 'Negroni', 'Negroni', 'Daiquiri']);
  });

  it('shows an error screen with buttons when the preview of the next recipe fails', async () => {
    answerPreview = (name) => (name === 'Negroni' ? errorResponse(400, 'Invalid recipe') : HttpResponse.json(matchedPreview(name)));
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
    // The app's client and stale time, without retries: a step that loaded the
    // lists on each mount would reload them once the cache has gone stale
    const queryClient = createQueryClient();
    const appQueryOptions = queryClient.getDefaultOptions().queries;
    queryClient.setDefaultOptions({ queries: { ...appQueryOptions, retry: false } });
    const staleTime = Number(appQueryOptions?.staleTime);
    render(<ImportCocktailWizard onClose={vi.fn()} />, { queryClient });

    try {
      uploadZip(names);
      await screen.findByText('cocktails.importWizard.batchPreview');
      await goToConfirmation();
      await confirmImport();
      for (let i = 1; i < names.length; i++) {
        vi.setSystemTime(Date.now() + staleTime + 1_000);
        await goToConfirmationFromResolve();
        await confirmImport();
      }

      expect(await screen.findByText('cocktails.importWizard.batchComplete')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    expect(confirmations).toHaveLength(10);
    for (const read of listReads) expect(read.count()).toBe(1);
  });

  it('goes back to the file from the first recipe, and after a failed preview', async () => {
    failFirstPreview('Server down');
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
    failFirstPreview('Server down');
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Mojito'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.tryAgain' }));

    expect(await screen.findByText('cocktails.importWizard.allResolved')).toBeInTheDocument();
  });

  it('warns when an existing list cannot be loaded', async () => {
    mockApiError('get', '/api/ingredients', 503, 'Down');
    render(<ImportCocktailWizard onClose={vi.fn()} />);

    uploadJson(recipe('Mojito'));
    await user.click(await screen.findByRole('button', { name: 'cocktails.importWizard.next' }));

    expect(await screen.findByText('cocktails.importWizard.listsLoadError')).toBeInTheDocument();
  });

  it('closes from the error screen of a single recipe', async () => {
    const onClose = vi.fn();
    render(<ImportCocktailWizard onClose={onClose} />);

    uploadJson(recipe('Mojito'));
    await goToConfirmation();
    // Only something else than an HTTP answer can reject with a non-Error
    rejectNextFetch('not an Error');
    await confirmImport();

    expect(await screen.findByText('cocktails.importWizard.error')).toBeInTheDocument();
    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cocktails.importWizard.skipRecipe' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
