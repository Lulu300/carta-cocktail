import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { axe } from '../../test/axe';
import { mockApiError, mockApiResponse, mockItemInUse } from '../../test/msw/utils';
import { qk } from '../../queries/keys';
import { categories as categoriesApi } from '../../services/api';
import type { DeletionImpact } from '../../types';
import { useForcedDelete } from './useForcedDelete';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

const CATEGORY_PATH = '/api/categories/:id';
const usedByRecipes: DeletionImpact = {
  cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }, { id: 5, name: 'Mojito', removedLines: 2 }],
  bottles: [],
};
const holdsBottles: DeletionImpact = { cocktails: [], bottles: [{ id: 7, name: 'Absolut' }] };

function DeleteButton() {
  const deleteCategory = useForcedDelete({
    deleteItem: categoriesApi.delete,
    invalidates: [qk.categories],
    deletedMessage: 'categories.deleted',
  });
  return <button onClick={() => deleteCategory(3)}>delete-category</button>;
}

function renderButton() {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const view = renderWithFeedback(<DeleteButton />, { queryClient });
  const refreshedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { ...view, refreshedKeys };
}

async function requestDeletion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'delete-category' }));
}

function forcedConfirmation() {
  return screen.getByRole('alertdialog');
}

function deleteAnywayButton() {
  return within(forcedConfirmation()).getByRole('button', { name: 'deletion.forced.confirm' });
}

afterEach(clearToasts);

describe('useForcedDelete', () => {
  it('deletes an unused item and refreshes the queries of the page', async () => {
    const user = userEvent.setup();
    const { refreshedKeys } = renderButton();

    await requestDeletion(user);

    expect(await screen.findByText('categories.deleted')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(refreshedKeys()).toEqual([qk.categories]);
  });

  it('lists the cocktails an item is used by, with the lines each one loses', async () => {
    const user = userEvent.setup();
    mockItemInUse(CATEGORY_PATH, usedByRecipes);
    const { container } = renderButton();

    await requestDeletion(user);

    const confirmation = await screen.findByRole('alertdialog', { name: 'deletion.forced.title' });
    expect(confirmation).toHaveAccessibleDescription('deletion.forced.recipesWarning deletion.forced.final');
    expect(confirmation).toHaveTextContent('deletion.forced.cocktails(2)');
    expect(confirmation).toHaveTextContent('deletion.forced.cocktailLines(Moscow Mule,1)');
    expect(confirmation).toHaveTextContent('deletion.forced.cocktailLines(Mojito,2)');
    expect(within(confirmation).getByRole('checkbox', { name: 'deletion.forced.acknowledgeRecipes' })).not.toBeChecked();
    expect(within(confirmation).getByRole('button', { name: 'common.cancel' })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps "Delete anyway" disabled until the risks are acknowledged', async () => {
    const user = userEvent.setup();
    mockItemInUse(CATEGORY_PATH, usedByRecipes);
    renderButton();

    await requestDeletion(user);
    await screen.findByRole('alertdialog');

    expect(deleteAnywayButton()).toBeDisabled();
    await user.click(within(forcedConfirmation()).getByRole('checkbox'));
    expect(deleteAnywayButton()).toBeEnabled();
  });

  it('forces the deletion once confirmed, summarises its impact and refreshes the recipes', async () => {
    const user = userEvent.setup();
    const requests = mockItemInUse(CATEGORY_PATH, usedByRecipes);
    const { refreshedKeys } = renderButton();

    await requestDeletion(user);
    await screen.findByRole('alertdialog');
    await user.click(within(forcedConfirmation()).getByRole('checkbox'));
    await user.click(deleteAnywayButton());

    expect(await screen.findByText(
      'deletion.forced.summary(categories.deleted,deletion.forced.cocktailsChanged(2))',
    )).toBeInTheDocument();
    expect(requests.map((url) => url.search)).toEqual(['', '?force=true']);
    expect(refreshedKeys()).toEqual([
      qk.categories, qk.cocktails, qk.availability, qk.shortages, qk.bottles, qk.menus,
    ]);
  });

  it('lists the bottles of a category and counts them in the summary', async () => {
    const user = userEvent.setup();
    mockItemInUse(CATEGORY_PATH, holdsBottles);
    renderButton();

    await requestDeletion(user);

    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('deletion.forced.bottlesWarning deletion.forced.final');
    expect(confirmation).toHaveTextContent('deletion.forced.bottles(1)');
    expect(within(confirmation).getByRole('listitem')).toHaveTextContent('Absolut');
    await user.click(within(confirmation).getByRole('checkbox', { name: 'deletion.forced.acknowledgeBottles' }));
    await user.click(deleteAnywayButton());

    expect(await screen.findByText(
      'deletion.forced.summary(categories.deleted,deletion.forced.bottlesDeleted(1))',
    )).toBeInTheDocument();
  });

  it('asks to accept both the changed recipes and the deleted bottles of a category', async () => {
    const user = userEvent.setup();
    mockItemInUse(CATEGORY_PATH, { cocktails: usedByRecipes.cocktails, bottles: holdsBottles.bottles });
    renderButton();

    await requestDeletion(user);

    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription(
      'deletion.forced.recipesWarning deletion.forced.bottlesWarning deletion.forced.final',
    );
    await user.click(within(confirmation).getByRole('checkbox', { name: 'deletion.forced.acknowledgeRecipesAndBottles' }));
    await user.click(deleteAnywayButton());

    expect(await screen.findByText(
      'deletion.forced.summary(categories.deleted,deletion.forced.bottlesDeleted(1), deletion.forced.cocktailsChanged(2))',
    )).toBeInTheDocument();
  });

  it('deletes nothing when cancelled and keeps the list in an error toast', async () => {
    const user = userEvent.setup();
    const requests = mockItemInUse(CATEGORY_PATH, usedByRecipes, 'Used by cocktail recipes');
    const { refreshedKeys } = renderButton();

    await requestDeletion(user);
    await screen.findByRole('alertdialog');
    await user.click(within(forcedConfirmation()).getByRole('button', { name: 'common.cancel' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Used by cocktail recipes');
    expect(alert).toHaveTextContent('deletion.usedByCocktails(Moscow Mule, Mojito)');
    expect(requests).toHaveLength(1);
    expect(refreshedKeys()).toEqual([]);
  });

  it('does not offer to force a conflict that lists nothing, such as an older backend', async () => {
    const user = userEvent.setup();
    mockApiError('delete', CATEGORY_PATH, 409, 'Conflict');
    renderButton();

    await requestDeletion(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('reports a forced deletion that fails', async () => {
    const user = userEvent.setup();
    mockItemInUse(CATEGORY_PATH, usedByRecipes);
    renderButton();
    await requestDeletion(user);
    await screen.findByRole('alertdialog');
    mockApiResponse('delete', CATEGORY_PATH, { error: 'Database is locked' }, 500);

    await user.click(within(forcedConfirmation()).getByRole('checkbox'));
    await user.click(deleteAnywayButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Database is locked'));
  });
});
