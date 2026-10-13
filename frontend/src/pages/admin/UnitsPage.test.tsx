import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { axe } from '../../test/axe';
import { buildUnit } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import UnitsPage from './UnitsPage';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

const centiliter = buildUnit({ id: 1, name: 'Centiliter', abbreviation: 'cl', conversionFactorToMl: 10 });
const piece = buildUnit({ id: 2, name: 'Piece', abbreviation: 'pc', conversionFactorToMl: null });

function renderPage() {
  return renderWithFeedback(<UnitsPage />);
}

async function renderLoadedPage() {
  renderPage();
  await screen.findByText('Centiliter');
}

function dialog() {
  return screen.getByRole('dialog');
}

async function fillCreateForm(user: ReturnType<typeof userEvent.setup>, name: string, abbreviation: string) {
  await user.click(screen.getByRole('button', { name: 'units.add' }));
  await user.type(within(dialog()).getByLabelText(/units\.name/), name);
  await user.type(within(dialog()).getByLabelText(/units\.abbreviation/), abbreviation);
}

beforeEach(() => {
  mockApiResponse('get', '/api/units', [centiliter, piece]);
});

afterEach(clearToasts);

describe('UnitsPage', () => {
  it('lists the units with their conversion', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'units.title' })).toBeInTheDocument();
    expect(screen.getByText('Piece')).toBeInTheDocument();
    expect(screen.getByText('1 cl = units.ml(10)')).toBeInTheDocument();
    expect(screen.getByText('units.notConvertible')).toBeInTheDocument();
  });

  it('never shows "no results" while the units are loading', async () => {
    mockApiPending('get', '/api/units');
    renderPage();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without units', async () => {
    mockApiResponse('get', '/api/units', []);
    renderPage();
    expect(await screen.findByText('common.noResults')).toBeInTheDocument();
  });

  it('shows a load error with a retry button', async () => {
    const user = userEvent.setup();
    mockNetworkError('get', '/api/units');
    renderPage();
    const retry = await screen.findByRole('button', { name: 'common.retry' });

    mockApiResponse('get', '/api/units', [centiliter, piece]);
    await user.click(retry);

    expect(await screen.findByText('Centiliter')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('creates a unit, closes the modal and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const created = captureRequest('post', '/api/units');
    const reloaded = captureRequest('get', '/api/units');
    await fillCreateForm(user, 'Milliliter', 'ml');
    await user.type(within(dialog()).getByLabelText('units.conversionFactor'), '1');

    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await created.body).toEqual({
      name: 'Milliliter',
      abbreviation: 'ml',
      conversionFactorToMl: 1,
      nameTranslations: null,
    });
    expect(screen.getByText('units.created')).toBeInTheDocument();
    // The list reloads once after the creation
    await waitFor(() => expect(reloaded.count()).toBe(1));
  });

  it('sends an empty conversion factor as null', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const created = captureRequest('post', '/api/units');
    await fillCreateForm(user, 'Pinch', 'pinch');

    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect(await created.body).toEqual({
      name: 'Pinch',
      abbreviation: 'pinch',
      conversionFactorToMl: null,
      nameTranslations: null,
    });
  });

  it('sends a single request on a fast double click, with the button busy meanwhile', async () => {
    const user = userEvent.setup();
    mockApiPending('post', '/api/units');
    const created = captureRequest('post', '/api/units');
    await renderLoadedPage();
    await fillCreateForm(user, 'Dash', 'dash');
    const save = within(dialog()).getByRole('button', { name: 'common.save' });

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(created.count()).toBe(1);
  });

  it('keeps the modal open and shows the error when saving fails', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/units', 409, 'This unit already exists');
    await renderLoadedPage();
    await fillCreateForm(user, 'Centiliter', 'cl');

    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This unit already exists'));
    expect(dialog()).toBeInTheDocument();
  });

  it('opens the edit modal filled with the unit, an empty factor for a piece unit', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

    expect(screen.getByText('units.edit')).toBeInTheDocument();
    expect(within(dialog()).getByDisplayValue('Piece')).toBeInTheDocument();
    expect(within(dialog()).getByLabelText('units.conversionFactor')).toHaveValue(null);
  });

  it('updates a unit and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const updated = captureRequest('put', '/api/units/:id');
    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

    const name = within(dialog()).getByDisplayValue('Centiliter');
    await user.clear(name);
    await user.type(name, 'Centilitre');
    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect((await updated.url).pathname).toBe('/api/units/1');
    expect(await updated.body).toEqual({
      name: 'Centilitre',
      abbreviation: 'cl',
      conversionFactorToMl: 10,
      nameTranslations: null,
    });
    expect(await screen.findByText('units.updated')).toBeInTheDocument();
  });

  it('deletes a unit after confirmation in the dialog', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/units/:id');

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('units.confirmDelete');
    await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

    expect(await screen.findByText('units.deleted')).toBeInTheDocument();
    expect((await deleted.url).pathname).toBe('/api/units/1');
  });

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const deleted = captureRequest('delete', '/api/units/:id');

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleted.count()).toBe(0);
  });

  it('shows the backend message and the cocktails that use a unit it refuses to delete', async () => {
    const user = userEvent.setup();
    mockApiResponse('delete', '/api/units/:id', {
      error: 'This unit is used by cocktails',
      details: { cocktails: [{ id: 5, name: 'Mojito', removedLines: 1 }], bottles: [] },
    }, 409);
    await renderLoadedPage();

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    const alert = await screen.findByText(/This unit is used by cocktails/);
    expect(alert).toHaveTextContent('deletion.usedByCocktails');
    expect(screen.getByText('Centiliter')).toBeInTheDocument();
  });

  it('filters the units by name or abbreviation', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('common.search'), 'pc');

    expect(screen.getByText('Piece')).toBeInTheDocument();
    expect(screen.queryByText('Centiliter')).not.toBeInTheDocument();
  });

  it('sends the translations typed in the translations block', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const created = captureRequest('post', '/api/units');
    await fillCreateForm(user, 'Gram', 'g');

    await user.click(within(dialog()).getByRole('button', { name: 'common.translations' }));
    await user.type(within(dialog()).getByLabelText('Français'), 'Gramme');
    await user.type(within(dialog()).getByLabelText('English'), 'Gram');
    await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

    expect(await created.body).toEqual({
      name: 'Gram',
      abbreviation: 'g',
      conversionFactorToMl: null,
      nameTranslations: { fr: 'Gramme', en: 'Gram' },
    });
  });

  it('fills the translations of the unit being edited', async () => {
    const user = userEvent.setup();
    mockApiResponse('get', '/api/units', [
      buildUnit({ name: 'Litre', abbreviation: 'l', conversionFactorToMl: 1000, nameTranslations: { fr: 'Litre', en: 'Liter' } }),
    ]);
    renderPage();
    // The list shows the name in the UI language
    await screen.findByText('Liter');

    await user.click(screen.getByRole('button', { name: 'common.edit' }));
    await user.click(within(dialog()).getByRole('button', { name: 'common.translations' }));

    expect(within(dialog()).getByLabelText('English')).toHaveValue('Liter');
  });

  it('collapses the translations block again when another unit is opened', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);
    await user.click(within(dialog()).getByRole('button', { name: 'common.translations' }));
    expect(within(dialog()).getByLabelText('Français')).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('button', { name: 'common.cancel' }));

    await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

    expect(within(dialog()).getByDisplayValue('Piece')).toBeInTheDocument();
    expect(within(dialog()).queryByLabelText('Français')).not.toBeInTheDocument();
  });

  it('closes the modal on cancel', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    await user.click(screen.getByRole('button', { name: 'units.add' }));

    await user.click(within(dialog()).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UnitsPage accessibility', () => {
  it('has no serious accessibility violation with the form modal open', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByText('Centiliter');
    await user.click(screen.getByRole('button', { name: 'units.add' }));

    expect(screen.getByRole('dialog', { name: 'units.add' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('closes the form modal with Escape', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    await user.click(screen.getByRole('button', { name: 'units.add' }));

    fireEvent(dialog(), new Event('cancel', { cancelable: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
