import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { act, createTestQueryClient, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import CocktailFormPage from './CocktailFormPage';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    cocktails: { get: vi.fn(), create: vi.fn(), update: vi.fn(), uploadImage: vi.fn() },
    categories: { list: vi.fn() },
    bottles: { list: vi.fn() },
    ingredients: { list: vi.fn(), create: vi.fn() },
    units: { list: vi.fn() },
    availability: { getAllCocktails: vi.fn() },
  };
});

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name?: string }) => entity?.name || '',
}));

import { ApiError, availability, bottles, categories, cocktails, ingredients, units } from '../../services/api';
import type { Cocktail } from '../../types';

const RUM_CATEGORY = { id: 1, name: 'Rum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 0, createdAt: '2024-01-01' };
const bottle = (id: number, name: string, remainingPercent = 100) => ({
  id, name, categoryId: 1, capacityMl: 700, remainingPercent, purchasePrice: null, openedAt: null,
  alcoholPercentage: null, location: null, isApero: false, isDigestif: false, createdAt: '2024-01-01',
});

const mojito: Cocktail = {
  id: 42,
  name: 'Mojito',
  description: 'Fresh',
  notes: null,
  imagePath: null,
  tags: 'rum, mint',
  isAvailable: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ingredients: [
    {
      id: 7, cocktailId: 42, quantity: 5, unitId: 1, sourceType: 'CATEGORY', bottleId: null, categoryId: 1,
      ingredientId: null, position: 0, preferredBottles: [{ id: 1, cocktailIngredientId: 7, bottleId: 2 }],
    },
  ],
  instructions: [{ id: 1, cocktailId: 42, stepNumber: 1, text: 'Muddle the mint' }],
};

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
  const section = screen.getByRole('heading', { name: 'cocktails.ingredients' }).closest('div.rounded-xl') as HTMLElement;
  return within(section).queryAllByRole('listitem');
}

async function addIngredientRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'cocktails.addIngredient' }));
  return ingredientRows().at(-1) as HTMLElement;
}

async function setQuantity(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, quantity: string) {
  const input = within(row).getByRole('spinbutton', { name: 'cocktails.quantity' });
  await user.clear(input);
  if (quantity) await user.type(input, quantity);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(categories.list).mockResolvedValue([RUM_CATEGORY]);
  vi.mocked(bottles.list).mockResolvedValue([bottle(1, 'Havana'), bottle(2, 'Diplomatico', 0), bottle(3, 'Empty rum', 0)]);
  vi.mocked(ingredients.list).mockResolvedValue([{ id: 1, name: 'Sugar syrup', icon: null, isAvailable: true, createdAt: '2024-01-01' }]);
  vi.mocked(units.list).mockResolvedValue([{ id: 1, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 }]);
  vi.mocked(availability.getAllCocktails).mockResolvedValue({});
  vi.mocked(cocktails.get).mockResolvedValue(mojito);
  vi.mocked(cocktails.create).mockResolvedValue(mojito);
  vi.mocked(cocktails.update).mockResolvedValue(mojito);
});

afterEach(clearToasts);

describe('CocktailFormPage, creation', () => {
  it('sends the full recipe, then shows a toast and goes back to the list', async () => {
    const user = userEvent.setup();
    await user.type(await renderNewForm(), 'Daiquiri');
    await user.type(screen.getByRole('textbox', { name: 'cocktails.tags' }), 'classic, ,sour');
    const row = await addIngredientRow(user);
    await setQuantity(user, row, '2');
    await user.type(screen.getByRole('textbox', { name: 'cocktails.step' }), 'Shake');
    await user.click(screen.getByRole('button', { name: 'cocktails.addInstruction' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(cocktails.create).toHaveBeenCalledWith({
      name: 'Daiquiri',
      description: null,
      notes: null,
      tags: ['classic', 'sour'],
      isAvailable: true,
      ingredients: [{
        sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 1,
        quantity: 2, unitId: 1, preferredBottleIds: undefined,
      }],
      instructions: [{ text: 'Shake' }],
    });
    expect(screen.getByText('cocktails.created')).toBeInTheDocument();
  });

  it('blocks the submission and shows the errors on the line, without any request', async () => {
    const user = userEvent.setup();
    await renderNewForm();
    const row = await addIngredientRow(user);
    await user.selectOptions(within(row).getByRole('combobox', { name: 'cocktails.freeIngredient' }), '');
    await setQuantity(user, row, '0');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(row).findByText('validation.sourceRequired · validation.positive')).toBeInTheDocument();
    expect(screen.getByText('validation.required')).toBeInTheDocument();
    expect(within(row).getByRole('spinbutton', { name: 'cocktails.quantity' })).toHaveAttribute('aria-invalid', 'true');
    expect(cocktails.create).not.toHaveBeenCalled();
  });

  it('refuses an emptied quantity and a line without unit', async () => {
    const user = userEvent.setup();
    vi.mocked(units.list).mockResolvedValue([]);
    await user.type(await renderNewForm(), 'Daiquiri');
    const row = await addIngredientRow(user);
    await setQuantity(user, row, '');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(row).findByText('validation.positive · validation.required')).toBeInTheDocument();
    expect(cocktails.create).not.toHaveBeenCalled();
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

    await waitFor(() => expect(cocktails.create).toHaveBeenCalled());
    expect(vi.mocked(cocktails.create).mock.calls[0][0].ingredients).toEqual([{
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

    const stepsList = steps[0].closest('ol') as HTMLElement;
    await user.click(within(stepsList).getAllByRole('button', { name: 'common.delete' })[0]);

    expect(screen.getAllByRole('textbox', { name: 'cocktails.step' })).toHaveLength(1);
  });

  it('creates the cocktail only once on a fast double click', async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: Cocktail) => void = () => {};
    vi.mocked(cocktails.create).mockReturnValue(new Promise<Cocktail>((resolve) => { resolveCreate = resolve; }));
    await user.type(await renderNewForm(), 'Mojito');

    await user.dblClick(screen.getByRole('button', { name: 'common.save' }));
    // The spinner of a pending button adds to its name.
    await waitFor(() => expect(screen.getByRole('button', { name: /common\.save/ })).toBeDisabled());
    expect(cocktails.create).toHaveBeenCalledTimes(1);

    resolveCreate(mojito);
    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
  });

  it('ignores a submit fired before the page re-renders', async () => {
    const user = userEvent.setup();
    vi.mocked(cocktails.create).mockReturnValue(new Promise<Cocktail>(() => {}));
    const nameInput = await renderNewForm();
    await user.type(nameInput, 'Mojito');
    const form = nameInput.closest('form') as HTMLFormElement;

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => expect(cocktails.create).toHaveBeenCalled());
    expect(cocktails.create).toHaveBeenCalledTimes(1);
  });

  it('stays on the form with an error toast when the creation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(cocktails.create).mockRejectedValue(new Error('Name is required'));
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
    vi.mocked(cocktails.create).mockResolvedValue(created);
    vi.mocked(cocktails.get).mockResolvedValue(created);
    vi.mocked(cocktails.uploadImage)
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({ ...created, imagePath: 'mojito.jpg' });
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
    expect(cocktails.create).toHaveBeenCalledTimes(1);
    expect(cocktails.update).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'Mojito' }));
    expect(cocktails.uploadImage).toHaveBeenCalledTimes(2);
    expect(cocktails.uploadImage).toHaveBeenLastCalledWith(42, image);
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('creates a free ingredient from the form with Enter', async () => {
    const user = userEvent.setup();
    vi.mocked(ingredients.create).mockResolvedValue({ id: 2, name: 'Lime', icon: null, isAvailable: true, createdAt: '2024-01-01' });
    await renderNewForm();
    await user.click(screen.getByRole('button', { name: '+ ingredients.add' }));
    await user.type(screen.getByRole('textbox', { name: 'ingredients.name' }), ' Lime {Enter}');

    await waitFor(() => expect(ingredients.create).toHaveBeenCalledWith({ name: 'Lime' }));
    expect(await screen.findByText('ingredients.created')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'ingredients.name' })).not.toBeInTheDocument();
    expect(ingredients.list).toHaveBeenCalledTimes(2);
    expect(cocktails.create).not.toHaveBeenCalled();
  });

  it('ignores a blank ingredient name', async () => {
    const user = userEvent.setup();
    await renderNewForm();
    await user.click(screen.getByRole('button', { name: '+ ingredients.add' }));
    await user.click(screen.getByRole('button', { name: 'common.create' }));

    expect(ingredients.create).not.toHaveBeenCalled();
  });
});

describe('CocktailFormPage, edition', () => {
  it('shows the cocktail even when no unit exists', async () => {
    vi.mocked(units.list).mockResolvedValue([]);
    renderAt('/admin/cocktails/42');

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');
    expect(screen.getByRole('textbox', { name: 'cocktails.description' })).toHaveValue('Fresh');
    expect(screen.getByRole('textbox', { name: 'cocktails.step' })).toHaveValue('Muddle the mint');
    expect(screen.getByText('mint')).toBeInTheDocument();
  });

  it('lists a preferred bottle that is now empty, so it can be unticked', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');

    const row = (await screen.findByRole('combobox', { name: 'cocktails.categoryType' })).closest('li') as HTMLElement;
    const emptyPreferred = within(row).getByRole('checkbox', { name: 'Diplomatico' });
    expect(emptyPreferred).toBeChecked();
    expect(within(row).queryByRole('checkbox', { name: 'Empty rum' })).not.toBeInTheDocument();

    await user.click(emptyPreferred);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(cocktails.update).toHaveBeenCalled());
    expect(vi.mocked(cocktails.update).mock.calls[0][1].ingredients?.[0].preferredBottleIds).toEqual([]);
  });

  it('goes back to the list on cancel, without saving', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');
    await user.click(await screen.findByRole('button', { name: 'common.cancel' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(cocktails.update).not.toHaveBeenCalled();
  });

  it('keeps what the admin typed when the lists and the cocktail reload in the background', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    renderAt('/admin/cocktails/42', queryClient);
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, 'Virgin mojito');

    await act(() => queryClient.invalidateQueries());

    expect(cocktails.get).toHaveBeenCalledTimes(2);
    expect(units.list).toHaveBeenCalledTimes(2);
    expect(nameInput).toHaveValue('Virgin mojito');
  });

  it.each([
    ['a list', () => vi.mocked(ingredients.list)],
    ['the cocktail', () => vi.mocked(cocktails.get)],
  ])('keeps the form and what the admin typed when %s fails to reload', async (_name, request) => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    renderAt('/admin/cocktails/42', queryClient);
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, 'Virgin mojito');

    request().mockRejectedValue(new ApiError(500, 'Server error'));
    await act(() => queryClient.invalidateQueries());

    expect(request()).toHaveBeenCalledTimes(2);
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
    renderAt('/admin/cocktails/42');
    await user.clear(await screen.findByRole('textbox', { name: 'cocktails.description' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(cocktails.update).toHaveBeenCalledWith(42, expect.objectContaining({
      description: null,
      tags: ['rum', 'mint'],
      ingredients: [expect.objectContaining({ sourceType: 'CATEGORY', categoryId: 1, preferredBottleIds: [2] })],
    }));
    expect(screen.getByText('cocktails.updated')).toBeInTheDocument();
  });

  it('warns when no preferred bottle of a category line is available', async () => {
    vi.mocked(availability.getAllCocktails).mockResolvedValue({
      42: {
        cocktailId: 42, isAvailable: true, maxServings: 4, missingIngredients: [], lowStockWarnings: [],
        ingredients: [{
          cocktailIngredientId: 7, sourceType: 'CATEGORY', name: 'Rum', icon: null, quantity: 5, unit: 'cl',
          isAvailable: true, availableCount: 4, preferredAvailable: false,
        }],
      },
    });
    renderAt('/admin/cocktails/42');

    const warning = (await screen.findByText('⚠️ cocktails.noPreferredAvailable')).parentElement as HTMLElement;
    expect(within(warning).getByText('Rum')).toBeInTheDocument();
  });

  it('shows a link back to the list when the cocktail does not exist', async () => {
    vi.mocked(cocktails.get).mockRejectedValue(new ApiError(404, 'Cocktail not found'));
    renderAt('/admin/cocktails/999');

    expect(await screen.findByText('cocktails.notFound')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'cocktails.backToList' })).toHaveAttribute('href', '/admin/cocktails');
  });

  it('offers to retry when the cocktail fails to load', async () => {
    const user = userEvent.setup();
    vi.mocked(cocktails.get).mockRejectedValueOnce(new ApiError(500, 'Server error'));
    renderAt('/admin/cocktails/42');

    await user.click(await screen.findByRole('button', { name: 'common.retry' }));

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toHaveValue('Mojito');
  });

  it('offers to retry when a list fails to load', async () => {
    const user = userEvent.setup();
    vi.mocked(units.list).mockRejectedValueOnce(new ApiError(500, 'Server error'));
    renderAt('/admin/cocktails/new');

    await user.click(await screen.findByRole('button', { name: 'common.retry' }));

    expect(await screen.findByRole('textbox', { name: /cocktails\.name/ })).toBeInTheDocument();
    expect(units.list).toHaveBeenCalledTimes(2);
  });
});

describe('CocktailFormPage, lines stored with a defect (C-21)', () => {
  // Saved before v1.8.0: an orphan line (its category was deleted) and a quantity of 0.
  const oldRecipe: Cocktail = {
    ...mojito,
    ingredients: [
      { id: 7, cocktailId: 42, quantity: 4, unitId: 1, sourceType: 'CATEGORY', bottleId: null, categoryId: null, ingredientId: null, position: 0 },
      { id: 8, cocktailId: 42, quantity: 0, unitId: 1, sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 1, position: 1 },
    ],
  };

  beforeEach(() => {
    vi.mocked(cocktails.get).mockResolvedValue(oldRecipe);
  });

  async function renameTo(user: ReturnType<typeof userEvent.setup>, name: string) {
    const nameInput = await screen.findByRole('textbox', { name: /cocktails\.name/ });
    await user.clear(nameInput);
    await user.type(nameInput, name);
  }

  it('saves a rename with the defective lines sent as they were, and warns on each of them', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');

    expect(screen.getAllByText('cocktails.storedDefect')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('cocktail list')).toBeInTheDocument();
    expect(cocktails.update).toHaveBeenCalledWith(42, expect.objectContaining({
      name: 'Old mojito',
      ingredients: [
        expect.objectContaining({ sourceType: 'CATEGORY', categoryId: null, quantity: 4 }),
        expect.objectContaining({ sourceType: 'INGREDIENT', ingredientId: 1, quantity: 0 }),
      ],
    }));
  });

  it('blocks the save once a defective line is changed but keeps its defect', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');
    const orphanRow = ingredientRows()[0];
    await setQuantity(user, orphanRow, '5');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(orphanRow).findByText('validation.sourceRequired')).toBeInTheDocument();
    expect(within(orphanRow).queryByText('cocktails.storedDefect')).not.toBeInTheDocument();
    expect(cocktails.update).not.toHaveBeenCalled();
  });

  it('blocks the save when a new defective line is added', async () => {
    const user = userEvent.setup();
    renderAt('/admin/cocktails/42');
    await renameTo(user, 'Old mojito');
    const newRow = await addIngredientRow(user);
    await setQuantity(user, newRow, '0');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await within(newRow).findByText('validation.positive')).toBeInTheDocument();
    expect(cocktails.update).not.toHaveBeenCalled();
  });
});
