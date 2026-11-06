import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { act, createTestQueryClient, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { server } from '../../test/msw/server';
import {
  buildBottle,
  buildCategory,
  buildCocktail,
  buildCocktailIngredient,
  buildIngredient,
  buildUnit,
} from '../../test/factories';
import {
  captureRequest,
  errorResponse,
  holdApiResponse,
  mockApiError,
  mockApiPending,
  mockApiResponse,
} from '../../test/msw/utils';
import type { Cocktail, CocktailInput } from '../../types';
import CocktailFormPage from './CocktailFormPage';

const RUM_CATEGORY = buildCategory({ id: 1, name: 'Rum', minimumPercent: 0 });
const bottle = (id: number, name: string, remainingPercent = 100) =>
  buildBottle({ id, name, categoryId: 1, remainingPercent, purchasePrice: null, alcoholPercentage: null });

const mojito = buildCocktail({
  id: 42,
  name: 'Mojito',
  description: 'Fresh',
  tags: 'rum, mint',
  ingredients: [
    buildCocktailIngredient({
      id: 7, cocktailId: 42, quantity: 5, unitId: 1, sourceType: 'CATEGORY', categoryId: 1, ingredient: null,
      position: 0, preferredBottles: [{ id: 1, cocktailIngredientId: 7, bottleId: 2 }],
    }),
  ],
  instructions: [{ id: 1, cocktailId: 42, stepNumber: 1, text: 'Muddle the mint' }],
});

function mockCocktail(cocktail: Cocktail) {
  mockApiResponse('get', '/api/cocktails/:id', cocktail);
}

function renderAt(path: string, queryClient = createTestQueryClient()) {
  window.history.pushState({}, '', path);
  return renderWithFeedback(
    // Both form routes render the page alone, as in App.tsx: React keeps it mounted between them.
    <>
      <Link to="/admin/cocktails/new">new cocktail</Link>
      <Routes>
        <Route path="/admin/cocktails" element={<p>cocktail list</p>} />
        <Route path="/admin/cocktails/new" element={<CocktailFormPage />} />
        <Route path="/admin/cocktails/:id" element={<CocktailFormPage />} />
      </Routes>
    </>,
    { queryClient },
  );
}

async function renderNewForm() {
  renderAt('/admin/cocktails/new');
  return screen.findByRole('textbox', { name: /cocktails\.name/ });
}

function ingredientRows() {
  const section = screen.getByRole('heading', { name: 'cocktails.ingredients' }).closest('div.rounded-xl');
  if (!(section instanceof HTMLElement)) throw new Error('No ingredients section');
  return within(section).queryAllByRole('listitem');
}

async function addIngredientRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'cocktails.addIngredient' }));
  const row = ingredientRows().at(-1);
  if (!row) throw new Error('No ingredient row');
  return row;
}

/** Records the recipe the form sends: POST /api/cocktails, or PUT /api/cocktails/:id. */
function captureRecipe(method: 'post' | 'put') {
  const request = captureRequest(method, method === 'post' ? '/api/cocktails' : '/api/cocktails/:id');
  return {
    ...request,
    recipe: async (): Promise<CocktailInput> => {
      const body = await request.body;
      if (!isCocktailInput(body)) throw new Error('The form sent no recipe');
      return body;
    },
  };
}

function isCocktailInput(body: unknown): body is CocktailInput {
  return typeof body === 'object' && body !== null && 'name' in body;
}

async function setQuantity(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, quantity: string) {
  const input = within(row).getByRole('spinbutton', { name: 'cocktails.quantity' });
  await user.clear(input);
  if (quantity) await user.type(input, quantity);
}

beforeEach(() => {
  mockApiResponse('get', '/api/categories', [RUM_CATEGORY]);
  mockApiResponse('get', '/api/bottles', [bottle(1, 'Havana'), bottle(2, 'Diplomatico', 0), bottle(3, 'Empty rum', 0)]);
  mockApiResponse('get', '/api/ingredients', [buildIngredient({ id: 1, name: 'Sugar syrup' })]);
  mockApiResponse('get', '/api/units', [buildUnit({ id: 1, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 })]);
  mockApiResponse('get', '/api/availability/cocktails', {});
  mockCocktail(mojito);
  mockApiResponse('post', '/api/cocktails', mojito, 201);
  mockApiResponse('put', '/api/cocktails/:id', mojito);
});

afterEach(clearToasts);

describe('CocktailFormPage, creation', () => {
  it('sends the full recipe, then shows a toast and goes back to the list', async () => {
    const user = userEvent.setup();
    const created = captureRecipe('post');
    await user.type(await renderNewForm(), 'Daiquiri');
    await user.type(screen.getByRole('textbox', { name: 'cocktails.tags' }), 'classic, ,sour');
    const row = await addIngredientRow(user);
    await setQuantity(user, row, '2');
    await user.type(screen.getByRole('textbox', { name: 'cocktails.step' }), 'Shake');
    await user.click(screen.getByRole('button', { name: 'cocktails.addInstruction' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    // JSON drops the undefined preferredBottleIds, as the server receives it
    expect(await created.recipe()).toEqual({
      name: 'Daiquiri',
      description: null,
      notes: null,
      tags: ['classic', 'sour'],
      isAvailable: true,
      ingredients: [{
        sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 1,
        quantity: 2, unitId: 1,
      }],
      instructions: [{ text: 'Shake' }],
    });
    expect(screen.getByText('cocktails.created')).toBeInTheDocument();
  });

  it('blocks the submission and shows the errors on the line, without any request', async () => {
    const user = userEvent.setup();
    const created = captureRecipe('post');
    await renderNewForm();
    const row = await addIngredientRow(user);
    await user.selectOptions(within(row).getByRole('combobox', { name: 'cocktails.freeIngredient' }), '');
    await setQuantity(user, row, '0');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(row).findByText('validation.sourceRequired · validation.positive')).toBeInTheDocument();
    expect(screen.getByText('validation.required')).toBeInTheDocument();
    expect(within(row).getByRole('spinbutton', { name: 'cocktails.quantity' })).toHaveAttribute('aria-invalid', 'true');
    expect(created.count()).toBe(0);
  });

  it('refuses an emptied quantity and a line without unit', async () => {
    const user = userEvent.setup();
    mockApiResponse('get', '/api/units', []);
    const created = captureRecipe('post');
    await user.type(await renderNewForm(), 'Daiquiri');
    const row = await addIngredientRow(user);
    await setQuantity(user, row, '');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(row).findByText('validation.positive · validation.required')).toBeInTheDocument();
    expect(created.count()).toBe(0);
  });

  it('keeps the values of the third line when the second one is removed', async () => {
    const user = userEvent.setup();
    await renderNewForm();
    await addIngredientRow(user);
    await setQuantity(user, await addIngredientRow(user), '2');
    await setQuantity(user, await addIngredientRow(user), '7');

    await user.click(within(ingredientRows()[1]).getByRole('button', { name: 'common.delete' }));

    const rows = ingredientRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('spinbutton', { name: 'cocktails.quantity' })).toHaveValue(7);
  });

  it('resets the source fields when the source changes, and sends the preferred bottles of a category', async () => {
    const user = userEvent.setup();
    const created = captureRecipe('post');
    await user.type(await renderNewForm(), 'Daiquiri');
    const row = await addIngredientRow(user);

    await user.selectOptions(within(row).getByRole('combobox', { name: 'cocktails.sourceType' }), 'BOTTLE');
    const bottleSelect = within(row).getByRole('combobox', { name: 'cocktails.specificBottle' });
    expect(bottleSelect).toHaveValue('');
    // Empty bottles cannot be picked for a new line.
    expect(within(bottleSelect).queryByText('Empty rum (Rum)')).not.toBeInTheDocument();
    await user.selectOptions(bottleSelect, '1');

    await user.selectOptions(within(row).getByRole('combobox', { name: 'cocktails.sourceType' }), 'CATEGORY');
    await user.selectOptions(within(row).getByRole('combobox', { name: 'cocktails.categoryType' }), '1');
    await user.click(within(row).getByRole('checkbox', { name: 'Havana' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect((await created.recipe()).ingredients).toEqual([{
      sourceType: 'CATEGORY', bottleId: null, categoryId: 1, ingredientId: null,
      quantity: 1, unitId: 1, preferredBottleIds: [1],
    }]);
  });

  it('removes a recipe step', async () => {
    const user = userEvent.setup();
    await renderNewForm();
    await user.click(screen.getByRole('button', { name: 'cocktails.addInstruction' }));
    const steps = screen.getAllByRole('textbox', { name: 'cocktails.step' });
    expect(steps).toHaveLength(2);

    const stepsList = steps[0].closest('ol');
    if (!(stepsList instanceof HTMLElement)) throw new Error('No steps list');
    await user.click(within(stepsList).getAllByRole('button', { name: 'common.delete' })[0]);

    expect(screen.getAllByRole('textbox', { name: 'cocktails.step' })).toHaveLength(1);
  });

  it('creates the cocktail only once on a fast double click', async () => {
    const user = userEvent.setup();
    const releaseCreate = holdApiResponse('post', '/api/cocktails', mojito);
    const created = captureRecipe('post');
    await user.type(await renderNewForm(), 'Mojito');

    await user.dblClick(screen.getByRole('button', { name: 'common.save' }));
    // The spinner of a pending button adds to its name.
    await waitFor(() => expect(screen.getByRole('button', { name: /common\.save/ })).toBeDisabled());
    expect(created.count()).toBe(1);

    releaseCreate();
    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
  });

  it('ignores a submit fired before the page re-renders', async () => {
    const user = userEvent.setup();
    mockApiPending('post', '/api/cocktails');
    const created = captureRecipe('post');
    const nameInput = await renderNewForm();
    await user.type(nameInput, 'Mojito');
    const form = nameInput.closest('form');
    if (!form) throw new Error('No form');

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => expect(created.count()).toBe(1));
    // Give a second request the time to arrive
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(created.count()).toBe(1);
  });

  it('stays on the form with an error toast when the creation fails', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/cocktails', 400, 'Name is required');
    await user.type(await renderNewForm(), 'Mojito');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
    expect(screen.queryByText('cocktail list')).not.toBeInTheDocument();
  });

  it('opens the created cocktail with the picked image when the upload fails, so the next save only updates it', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const created = { ...mojito, description: null, tags: '', ingredients: [], instructions: [] };
    mockApiResponse('post', '/api/cocktails', created, 201);
    mockCocktail(created);
    // The first upload fails, the next one stores the image
    let uploads = 0;
    server.use(
      http.post('/api/cocktails/:id/image', () => {
        uploads += 1;
        return uploads === 1
          ? errorResponse(500, 'Upload failed')
          : HttpResponse.json({ ...created, imagePath: 'mojito.jpg' });
      }),
    );
    const creations = captureRecipe('post');
    const updates = captureRecipe('put');
    const lastUpload = captureRequest('post', '/api/cocktails/:id/image');
    const image = new File(['img'], 'mojito.png', { type: 'image/png' });
    await user.type(await renderNewForm(), 'Mojito');
    await user.upload(screen.getByLabelText('cocktails.image'), image);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/cocktails/42');
    expect(await screen.findByText('cocktails.edit')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');
    // The preview is decorative (empty alt): it has no img role.
    expect(document.querySelector('img[src="blob:preview"]')).not.toBeNull();

    // No new pick: the same file is sent again with the update.
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(creations.count()).toBe(1);
    expect((await updates.url).pathname).toBe('/api/cocktails/42');
    expect(await updates.recipe()).toMatchObject({ name: 'Mojito' });
    expect(uploads).toBe(2);
    expect((await lastUpload.url).pathname).toBe('/api/cocktails/42/image');
    expect(await lastUpload.body).toContain('name="image"');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('creates a free ingredient from the form with Enter', async () => {
    const user = userEvent.setup();
    mockApiResponse('post', '/api/ingredients', buildIngredient({ id: 2, name: 'Lime' }), 201);
    const createdIngredient = captureRequest('post', '/api/ingredients');
    const created = captureRecipe('post');
    await renderNewForm();
    const ingredientsReloaded = captureRequest('get', '/api/ingredients');
    await user.click(screen.getByRole('button', { name: '+ ingredients.add' }));
    await user.type(screen.getByRole('textbox', { name: 'ingredients.name' }), ' Lime {Enter}');

    expect(await createdIngredient.body).toEqual({ name: 'Lime' });
    expect(await screen.findByText('ingredients.created')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'ingredients.name' })).not.toBeInTheDocument();
    await waitFor(() => expect(ingredientsReloaded.count()).toBe(1));
    expect(created.count()).toBe(0);
  });

  it('ignores a blank ingredient name', async () => {
    const user = userEvent.setup();
    const createdIngredient = captureRequest('post', '/api/ingredients');
    await renderNewForm();
    await user.click(screen.getByRole('button', { name: '+ ingredients.add' }));
    await user.click(screen.getByRole('button', { name: 'common.create' }));

    expect(createdIngredient.count()).toBe(0);
  });
});

describe('CocktailFormPage, edition', () => {
  it('shows the cocktail even when no unit exists', async () => {
    mockApiResponse('get', '/api/units', []);
    renderAt('/admin/cocktails/42');

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');
    expect(screen.getByRole('textbox', { name: 'cocktails.description' })).toHaveValue('Fresh');
    expect(screen.getByRole('textbox', { name: 'cocktails.step' })).toHaveValue('Muddle the mint');
    expect(screen.getByText('mint')).toBeInTheDocument();
  });

  it('lists a preferred bottle that is now empty, so it can be unticked', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');

    const row = (await screen.findByRole('combobox', { name: 'cocktails.categoryType' })).closest('li');
    if (!row) throw new Error('No ingredient row');
    const emptyPreferred = within(row).getByRole('checkbox', { name: 'Diplomatico' });
    expect(emptyPreferred).toBeChecked();
    expect(within(row).queryByRole('checkbox', { name: 'Empty rum' })).not.toBeInTheDocument();

    await user.click(emptyPreferred);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect((await updated.recipe()).ingredients?.[0].preferredBottleIds).toEqual([]);
  });

  it('goes back to the list on cancel, without saving', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');
    await user.click(await screen.findByRole('button', { name: 'common.cancel' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(updated.count()).toBe(0);
  });

  it('keeps what the admin typed when the lists and the cocktail reload in the background', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    renderAt('/admin/cocktails/42', queryClient);
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, 'Virgin mojito');
    const cocktailReloaded = captureRequest('get', '/api/cocktails/:id');
    const unitsReloaded = captureRequest('get', '/api/units');

    await act(() => queryClient.invalidateQueries());

    expect(cocktailReloaded.count()).toBe(1);
    expect(unitsReloaded.count()).toBe(1);
    expect(nameInput).toHaveValue('Virgin mojito');
  });

  it.each([
    ['a list', '/api/ingredients'],
    ['the cocktail', '/api/cocktails/:id'],
  ])('keeps the form and what the admin typed when %s fails to reload', async (_name, path) => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    renderAt('/admin/cocktails/42', queryClient);
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, 'Virgin mojito');

    mockApiError('get', path, 500, 'Server error');
    const reloaded = captureRequest('get', path);
    await act(() => queryClient.invalidateQueries());

    expect(reloaded.count()).toBe(1);
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveValue('Virgin mojito');
    expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument();
  });

  it('empties the form when going from a cocktail to a new one', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');
    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');

    await user.click(screen.getByRole('link', { name: 'new cocktail' }));

    expect(await screen.findByText('cocktails.add')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: 'cocktails.step' })).toHaveValue('');
  });

  it('sends an emptied description as null and shows a toast', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');
    await user.clear(await screen.findByRole('textbox', { name: 'cocktails.description' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect((await updated.url).pathname).toBe('/api/cocktails/42');
    expect(await updated.recipe()).toMatchObject({
      description: null,
      tags: ['rum', 'mint'],
      ingredients: [expect.objectContaining({ sourceType: 'CATEGORY', categoryId: 1, preferredBottleIds: [2] })],
    });
    expect(screen.getByText('cocktails.updated')).toBeInTheDocument();
  });

  it('warns when no preferred bottle of a category line is available', async () => {
    mockApiResponse('get', '/api/availability/cocktails', {
      42: {
        cocktailId: 42, isAvailable: true, maxServings: 4, missingIngredients: [], lowStockWarnings: [],
        ingredients: [{
          cocktailIngredientId: 7, sourceType: 'CATEGORY', name: 'Rum', icon: null, quantity: 5, unit: 'cl',
          isAvailable: true, availableCount: 4, preferredAvailable: false,
        }],
      },
    });
    renderAt('/admin/cocktails/42');

    const warning = (await screen.findByText('⚠️ cocktails.noPreferredAvailable')).parentElement;
    if (!warning) throw new Error('No warning');
    expect(within(warning).getByText('Rum')).toBeInTheDocument();
  });

  it('shows a link back to the list when the cocktail does not exist', async () => {
    mockApiError('get', '/api/cocktails/:id', 404, 'Cocktail not found');
    renderAt('/admin/cocktails/999');

    expect(await screen.findByText('cocktails.notFound')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'cocktails.backToList' })).toHaveAttribute('href', '/admin/cocktails');
  });

  it('offers to retry when the cocktail fails to load', async () => {
    const user = userEvent.setup();
    mockApiError('get', '/api/cocktails/:id', 500, 'Server error');
    renderAt('/admin/cocktails/42');

    const retry = await screen.findByRole('button', { name: 'common.retry' });
    mockCocktail(mojito);
    await user.click(retry);

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');
  });

  it('offers to retry when a list fails to load', async () => {
    const user = userEvent.setup();
    mockApiError('get', '/api/units', 500, 'Server error');
    renderAt('/admin/cocktails/new');

    const retry = await screen.findByRole('button', { name: 'common.retry' });
    mockApiResponse('get', '/api/units', [buildUnit({ id: 1, abbreviation: 'cl' })]);
    const unitsReloaded = captureRequest('get', '/api/units');
    await user.click(retry);

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toBeInTheDocument();
    expect(unitsReloaded.count()).toBe(1);
  });
});

describe('CocktailFormPage, lines stored with a defect (C-21)', () => {
  // Saved before v1.8.0: an orphan line (its category was deleted) and a quantity of 0.
  const oldRecipe: Cocktail = {
    ...mojito,
    ingredients: [
      buildCocktailIngredient({ id: 7, cocktailId: 42, quantity: 4, sourceType: 'CATEGORY', ingredient: null, position: 0 }),
      buildCocktailIngredient({
        id: 8, cocktailId: 42, quantity: 0, ingredient: buildIngredient({ id: 1, name: 'Sugar syrup' }), position: 1,
      }),
    ],
  };

  beforeEach(() => {
    mockCocktail(oldRecipe);
  });

  async function renameTo(user: ReturnType<typeof userEvent.setup>, name: string) {
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, name);
  }

  it('saves a rename with the defective lines sent as they were, and warns on each of them', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');

    expect(screen.getAllByText('cocktails.storedDefect')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(await updated.recipe()).toEqual(expect.objectContaining({
      name: 'Old mojito',
      ingredients: [
        expect.objectContaining({ sourceType: 'CATEGORY', categoryId: null, quantity: 4 }),
        expect.objectContaining({ sourceType: 'INGREDIENT', ingredientId: 1, quantity: 0 }),
      ],
    }));
  });

  it('blocks the save once a defective line is changed but keeps its defect', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');
    const orphanRow = ingredientRows()[0];
    await setQuantity(user, orphanRow, '5');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(orphanRow).findByText('validation.sourceRequired')).toBeInTheDocument();
    expect(within(orphanRow).queryByText('cocktails.storedDefect')).not.toBeInTheDocument();
    expect(updated.count()).toBe(0);
  });

  it('blocks the save when a new defective line is added', async () => {
    const user = userEvent.setup();
    const updated = captureRecipe('put');
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');
    const newRow = await addIngredientRow(user);
    await setQuantity(user, newRow, '0');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(newRow).findByText('validation.positive')).toBeInTheDocument();
    expect(updated.count()).toBe(0);
  });
});
