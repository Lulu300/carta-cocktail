import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildIngredient } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import IngredientsPage from './IngredientsPage';

const lime = buildIngredient({ id: 1, name: 'Lime', icon: '🍋', isAvailable: true });
const sugar = buildIngredient({ id: 2, name: 'Sugar', nameTranslations: { fr: 'Sucre', en: 'Sugar' }, icon: null, isAvailable: false });

function renderPage() {
  return renderWithFeedback(<IngredientsPage />);
}

async function renderLoadedPage() {
  renderPage();
  await screen.findByText('Lime');
}

function dialog() {
  return screen.getByRole('dialog');
}

async function confirmDeletion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));
}

beforeEach(() => {
  mockApiResponse('get', '/api/ingredients', [lime, sugar]);
});

afterEach(clearToasts);

describe('IngredientsPage', () => {
  it('shows a card per ingredient, with a default icon', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'ingredients.title' })).toBeInTheDocument();
    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.getByText('🍋')).toBeInTheDocument();
    expect(screen.getByText('📦')).toBeInTheDocument();
  });

  it('never shows "no results" while the ingredients are loading', () => {
    mockApiPending('get', '/api/ingredients');
    renderPage();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without ingredients', async () => {
    mockApiResponse('get', '/api/ingredients', []);
    renderPage();
    expect(await screen.findByText('common.noResults')).toBeInTheDocument();
  });

  it('shows a load error with a retry button', async () => {
    const user = userEvent.setup();
    mockNetworkError('get', '/api/ingredients');
    renderPage();
    const retry = await screen.findByRole('button', { name: 'common.retry' });

    mockApiResponse('get', '/api/ingredients', [lime, sugar]);
    await user.click(retry);

    expect(await screen.findByText('Lime')).toBeInTheDocument();
  });

  it('shows the availability filters with their counts', async () => {
    await renderLoadedPage();
    expect(screen.getByText('ingredients.filter.all')).toBeInTheDocument();
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });

  it('filters the available and the unavailable ingredients', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getByText('ingredients.filter.available'));
    expect(screen.getByText('Lime')).toBeInTheDocument();
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();

    await user.click(screen.getByText('ingredients.filter.unavailable'));
    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.queryByText('Lime')).not.toBeInTheDocument();
  });

  it('filters by search term', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('common.search'), 'lim');

    expect(screen.getByText('Lime')).toBeInTheDocument();
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
  });

  it('marks every ingredient available or unavailable, then reloads the list', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const reloaded = captureRequest('get', '/api/ingredients');

    const allAvailable = captureRequest('post', '/api/ingredients/bulk-availability');
    await user.click(screen.getByRole('button', { name: 'ingredients.allAvailable' }));
    expect(await allAvailable.body).toEqual({ available: true });
    await waitFor(() => expect(reloaded.count()).toBe(1));

    const allUnavailable = captureRequest('post', '/api/ingredients/bulk-availability');
    await user.click(screen.getByRole('button', { name: 'ingredients.allUnavailable' }));
    expect(await allUnavailable.body).toEqual({ available: false });
    await waitFor(() => expect(reloaded.count()).toBe(2));
  });

  it('toggles the availability of an ingredient by clicking its card', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const updated = captureRequest('put', '/api/ingredients/:id');
    const reloaded = captureRequest('get', '/api/ingredients');

    await user.click(screen.getByText('Lime'));

    expect((await updated.url).pathname).toBe('/api/ingredients/1');
    expect(await updated.body).toEqual({ isAvailable: false });
    await waitFor(() => expect(reloaded.count()).toBe(1));
  });

  it('toggles the availability from the keyboard with a switch named after the ingredient', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const updated = captureRequest('put', '/api/ingredients/:id');
    const limeSwitch = screen.getByRole('switch', { name: 'Lime' });
    expect(limeSwitch).toHaveAttribute('aria-checked', 'true');

    limeSwitch.focus();
    await user.keyboard(' ');

    expect((await updated.url).pathname).toBe('/api/ingredients/1');
    expect(await updated.body).toEqual({ isAvailable: false });
  });

  it('names the search field, marks the active filter and announces the number of ingredients', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    expect(screen.getByRole('searchbox', { name: 'ingredients.search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ingredients.filter.all' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /ingredients\.filter\.available/ }));
    expect(screen.getByRole('button', { name: /ingredients\.filter\.available/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('common.resultCount')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows an error toast when the toggle fails', async () => {
    const user = userEvent.setup();
    mockApiError('put', '/api/ingredients/:id', 500, 'Server down');
    await renderLoadedPage();

    await user.click(screen.getByText('Sugar'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server down'));
  });

  it('creates an ingredient with its icon and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const created = captureRequest('post', '/api/ingredients');
    await user.click(screen.getByRole('button', { name: 'ingredients.add' }));

    await user.type(within(dialog()).getByLabelText(/ingredients\.name/), 'Mint');
    await user.click(within(dialog()).getByText('🌿'));
    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect(await created.body).toEqual({ name: 'Mint', icon: '🌿', nameTranslations: null });
    expect(await screen.findByText('ingredients.created')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends a single request on a fast double click on save', async () => {
    const user = userEvent.setup();
    mockApiPending('post', '/api/ingredients');
    const created = captureRequest('post', '/api/ingredients');
    await renderLoadedPage();
    await user.click(screen.getByRole('button', { name: 'ingredients.add' }));
    await user.type(within(dialog()).getByLabelText(/ingredients\.name/), 'Mint');
    const save = within(dialog()).getByRole('button', { name: 'common.save' });

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(created.count()).toBe(1);
  });

  it('updates an ingredient, keeping its translations, and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const updated = captureRequest('put', '/api/ingredients/:id');
    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

    const name = within(dialog()).getByDisplayValue('Sugar');
    await user.clear(name);
    await user.type(name, 'Cane sugar');
    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect((await updated.url).pathname).toBe('/api/ingredients/2');
    expect(await updated.body).toEqual({
      name: 'Cane sugar',
      icon: null,
      nameTranslations: { fr: 'Sucre', en: 'Sugar' },
    });
    expect(await screen.findByText('ingredients.updated')).toBeInTheDocument();
    // The edit button does not toggle the card it sits on.
    expect(updated.count()).toBe(1);
  });

  it('deletes an ingredient after confirmation and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/ingredients/:id');
    const updated = captureRequest('put', '/api/ingredients/:id');

    await confirmDeletion(user);

    expect(await screen.findByText('ingredients.deleted')).toBeInTheDocument();
    expect((await deleted.url).pathname).toBe('/api/ingredients/1');
    // The delete button does not toggle the card it sits on.
    expect(updated.count()).toBe(0);
  });

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/ingredients/:id');

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleted.count()).toBe(0);
  });

  it('shows the backend message when the deletion is refused', async () => {
    const user = userEvent.setup();
    mockApiResponse('delete', '/api/ingredients/:id', {
      error: 'This ingredient is used by cocktails',
      details: { cocktails: [{ id: 5, name: 'Mojito', removedLines: 1 }], bottles: [] },
    }, 409);
    await renderLoadedPage();

    await confirmDeletion(user);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This ingredient is used by cocktails'));
  });

  it('collapses the translations block again when another ingredient is opened', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);
    await user.click(within(dialog()).getByRole('button', { name: 'common.translations' }));
    expect(within(dialog()).getByLabelText('Français')).toHaveValue('Sucre');
    await user.click(within(dialog()).getByRole('button', { name: 'common.cancel' }));

    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

    expect(within(dialog()).queryByLabelText('Français')).not.toBeInTheDocument();
  });
});
