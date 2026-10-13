import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildMenu } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse } from '../../test/msw/utils';
import MenusPage from './MenusPage';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

const aperitifs = buildMenu({ id: 1, name: 'Apéritifs', slug: 'aperitifs', type: 'APEROS', _count: { cocktails: 0, bottles: 5 } });
const digestifs = buildMenu({
  id: 2,
  name: 'Digestifs',
  slug: 'digestifs',
  type: 'DIGESTIFS',
  isPublic: false,
  _count: { cocktails: 0, bottles: 2 },
});
const summer = buildMenu({ id: 3, name: 'Summer Menu', slug: 'summer', description: 'Summer cocktails', _count: { cocktails: 8, bottles: 0 } });

type User = ReturnType<typeof userEvent.setup>;

function renderPage() {
  return renderWithFeedback(<MenusPage />);
}

async function renderLoadedPage() {
  renderPage();
  await screen.findByText('Summer Menu');
}

function dialog() {
  return screen.getByRole('dialog');
}

async function fillCreateForm(user: User, name: string, slug: string) {
  await user.click(screen.getByRole('button', { name: 'menus.add' }));
  await user.type(within(dialog()).getByLabelText(/menus\.name/), name);
  await user.type(within(dialog()).getByLabelText(/menus\.slug/), slug);
}

beforeEach(() => {
  mockApiResponse('get', '/api/menus', [aperitifs, digestifs, summer]);
});

afterEach(clearToasts);

describe('MenusPage', () => {
  it('lists the menus with their type, visibility and content', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'menus.title' })).toBeInTheDocument();
    expect(screen.getByText('menus.types.cocktails')).toBeInTheDocument();
    expect(screen.getByText('menus.types.aperos')).toBeInTheDocument();
    expect(screen.getByText('menus.types.digestifs')).toBeInTheDocument();
    expect(screen.getAllByText('common.yes')).toHaveLength(2);
    expect(screen.getAllByText('common.no')).toHaveLength(1);
    expect(screen.getByText('menus.bottleCount(5)')).toBeInTheDocument();
    expect(screen.getByText('menus.cocktailCount(8)')).toBeInTheDocument();
  });

  it('links each menu to its editor, the bottle editor for a bottle menu', async () => {
    await renderLoadedPage();
    const editLinks = screen.getAllByRole('link', { name: 'common.edit' });
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/menus/1/bottles',
      '/admin/menus/2/bottles',
      '/admin/menus/3',
    ]);
  });

  it('marks the system menus and offers no deletion for them', async () => {
    await renderLoadedPage();
    expect(screen.getAllByText('menus.default')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'common.delete' })).toHaveLength(1);
  });

  it('never shows "no results" while the menus are loading', () => {
    mockApiPending('get', '/api/menus');
    renderPage();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without menus', async () => {
    mockApiResponse('get', '/api/menus', []);
    renderPage();
    expect(await screen.findByText('common.noResults')).toBeInTheDocument();
  });

  it('filters the menus by name or slug', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('common.search'), 'summ');

    expect(screen.getByText('Summer Menu')).toBeInTheDocument();
    expect(screen.queryByText('menus.default')).not.toBeInTheDocument();
  });

  it('creates a menu with a cleaned slug and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const created = captureRequest('post', '/api/menus');
    await fillCreateForm(user, 'Winter', 'Winter Menu!');
    await user.type(within(dialog()).getByLabelText('menus.description'), 'Hot drinks');
    await user.click(within(dialog()).getByRole('switch', { name: 'menus.isPublic' }));

    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect(await created.body).toEqual({
      name: 'Winter',
      slug: 'winter-menu-',
      description: 'Hot drinks',
      isPublic: true,
    });
    expect(await screen.findByText('menus.created')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a slug already taken in a toast and keeps the form open', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/menus', 409, 'This slug is already used');
    await renderLoadedPage();
    await fillCreateForm(user, 'Summer 2', 'summer');

    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This slug is already used'));
    expect(within(dialog()).getByDisplayValue('summer')).toBeInTheDocument();
  });

  it('sends a single request on a fast double click on save', async () => {
    const user = userEvent.setup();
    mockApiPending('post', '/api/menus');
    const created = captureRequest('post', '/api/menus');
    await renderLoadedPage();
    await fillCreateForm(user, 'Winter', 'winter');
    const save = within(dialog()).getByRole('button', { name: 'common.save' });

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(created.count()).toBe(1);
  });

  it('starts from an empty form after a creation', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    await fillCreateForm(user, 'Winter', 'winter');
    await user.click(within(dialog()).getByRole('button', { name: 'common.cancel' }));

    await user.click(screen.getByRole('button', { name: 'menus.add' }));

    expect(within(dialog()).getByLabelText(/menus\.name/)).toHaveValue('');
  });

  it('deletes a menu after confirmation and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/menus/:id');

    await user.click(screen.getByRole('button', { name: 'common.delete' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('menus.confirmDelete');
    await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

    expect(await screen.findByText('menus.deleted')).toBeInTheDocument();
    expect((await deleted.url).pathname).toBe('/api/menus/3');
  });

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/menus/:id');

    await user.click(screen.getByRole('button', { name: 'common.delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleted.count()).toBe(0);
  });
});
