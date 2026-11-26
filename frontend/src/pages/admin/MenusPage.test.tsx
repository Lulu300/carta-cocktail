import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildMenu } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse } from '../../test/msw/utils';
import MenusPage from './MenusPage';

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
const summerAperos = buildMenu({ id: 4, name: 'Summer Aperos', slug: 'summer-aperos', type: 'APEROS', _count: { cocktails: 0, bottles: 3 } });

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
  await user.click(screen.getByRole('button', { name: 'Add Menu' }));
  await user.type(within(dialog()).getByLabelText(/Name/), name);
  await user.type(within(dialog()).getByLabelText(/URL Slug/), slug);
}

beforeEach(() => {
  window.history.pushState({}, '', '/admin/menus');
  mockApiResponse('get', '/api/menus', [aperitifs, digestifs, summer, summerAperos]);
});

afterEach(clearToasts);

describe('MenusPage', () => {
  it('lists the menus with their type, visibility and content', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'Menus' })).toBeInTheDocument();
    expect(screen.getByText('Cocktails')).toBeInTheDocument();
    expect(screen.getAllByText('Aperitifs')).toHaveLength(2);
    expect(screen.getAllByText('Digestifs')).toHaveLength(2);
    expect(screen.getAllByText('Yes')).toHaveLength(3);
    expect(screen.getAllByText('No')).toHaveLength(1);
    expect(screen.getByText('5 bottles')).toBeInTheDocument();
    expect(screen.getByText('8 cocktails')).toBeInTheDocument();
  });

  it('links each menu to its editor, the bottle editor for a bottle menu', async () => {
    await renderLoadedPage();
    const editLinks = screen.getAllByRole('link', { name: 'Edit' });
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/menus/1/bottles',
      '/admin/menus/2/bottles',
      '/admin/menus/3',
      '/admin/menus/4/bottles',
    ]);
  });

  it('marks the system menus and offers no deletion for them, unlike a personal bottle menu', async () => {
    await renderLoadedPage();
    expect(screen.getAllByText('(default)')).toHaveLength(2);
    const rows = screen.getAllByRole('row').slice(1);
    const deletable = rows.filter((row) => within(row).queryByRole('button', { name: 'Delete' }));
    expect(deletable.map((row) => within(row).getAllByRole('link')[0]!.textContent)).toEqual(['Summer Menu', 'Summer Aperos']);
  });

  it('never shows "no results" while the menus are loading', () => {
    mockApiPending('get', '/api/menus');
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without menus', async () => {
    mockApiResponse('get', '/api/menus', []);
    renderPage();
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('filters the menus by name or slug', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('Search...'), 'summ');

    expect(screen.getByText('Summer Menu')).toBeInTheDocument();
    expect(screen.queryByText('(default)')).not.toBeInTheDocument();
  });

  it('creates a cocktail menu by default with a cleaned slug, confirms with a toast and opens its editor', async () => {
    const user = userEvent.setup();
    mockApiResponse('post', '/api/menus', buildMenu({ id: 9, name: 'Winter', slug: 'winter-menu-' }), 201);
    await renderLoadedPage();
    const created = captureRequest('post', '/api/menus');
    await fillCreateForm(user, 'Winter', 'Winter Menu!');
    await user.type(within(dialog()).getByLabelText('Description'), 'Hot drinks');
    await user.click(within(dialog()).getByRole('switch', { name: 'Public' }));

    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await created.body).toEqual({
      name: 'Winter',
      slug: 'winter-menu-',
      description: 'Hot drinks',
      isPublic: true,
      type: 'COCKTAILS',
    });
    expect(await screen.findByText('Menu created')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/menus/9');
  });

  it('creates an aperitifs menu and opens the bottle editor', async () => {
    const user = userEvent.setup();
    mockApiResponse('post', '/api/menus', buildMenu({ id: 9, name: 'Summer aperitif', slug: 'summer-aperitif', type: 'APEROS' }), 201);
    await renderLoadedPage();
    const created = captureRequest('post', '/api/menus');
    await fillCreateForm(user, 'Summer aperitif', 'summer-aperitif');
    const type = within(dialog()).getByRole('combobox', { name: 'Type' });
    expect(type).toHaveValue('COCKTAILS');
    expect(type).toHaveAccessibleDescription('Cannot be changed later. Aperitifs and digestifs menus hold bottles, chosen among the bottles checked for their type.');
    expect(within(type).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Cocktails', 'Aperitifs', 'Digestifs',
    ]);

    await user.selectOptions(type, 'APEROS');
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    expect(await created.body).toEqual({
      name: 'Summer aperitif', slug: 'summer-aperitif', description: '', isPublic: false, type: 'APEROS',
    });
    await waitFor(() => expect(window.location.pathname).toBe('/admin/menus/9/bottles'));
  });

  it('shows a slug already taken in a toast and keeps the form open', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/menus', 409, 'This slug is already used');
    await renderLoadedPage();
    await fillCreateForm(user, 'Summer 2', 'summer');

    await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This slug is already used'));
    expect(within(dialog()).getByDisplayValue('summer')).toBeInTheDocument();
  });

  it('sends a single request on a fast double click on save', async () => {
    const user = userEvent.setup();
    mockApiPending('post', '/api/menus');
    const created = captureRequest('post', '/api/menus');
    await renderLoadedPage();
    await fillCreateForm(user, 'Winter', 'winter');
    const save = within(dialog()).getByRole('button', { name: 'Save' });

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(created.count()).toBe(1);
  });

  it('starts from an empty form after a creation', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    await fillCreateForm(user, 'Winter', 'winter');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Add Menu' }));

    expect(within(dialog()).getByLabelText(/Name/)).toHaveValue('');
  });

  it('deletes a menu after confirmation and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/menus/:id');

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('Delete this menu?');
    await user.click(within(confirmation).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Menu deleted')).toBeInTheDocument();
    expect((await deleted.url).pathname).toBe('/api/menus/3');
  });

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/menus/:id');

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleted.count()).toBe(0);
  });
});
