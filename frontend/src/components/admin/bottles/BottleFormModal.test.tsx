import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildBottle, buildCategory } from '../../../test/factories';
import type { Bottle, Category } from '../../../types';
import { useEntityForm } from '../useEntityForm';
import BottleFormModal from './BottleFormModal';
import { toBottleForm, type BottleInput } from './bottleForm';

// The app is in French, whatever the language of the browser running the tests.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));

/** The modal as BottlesPage opens it: on a bottle to edit, or empty to create one. */
function BottleFormHarness({ categories, bottle, onSubmit }: {
  categories: Category[];
  bottle?: Bottle;
  onSubmit: (data: BottleInput) => void;
}) {
  const entityForm = useEntityForm<Bottle, ReturnType<typeof toBottleForm>>((item) => toBottleForm(categories, item));
  return (
    <>
      <button type="button" onClick={() => entityForm.open(bottle)}>open</button>
      <BottleFormModal entityForm={entityForm} categories={categories} isSaving={false} onSubmit={onSubmit} />
    </>
  );
}

async function renderOpenForm(props: Parameters<typeof BottleFormHarness>[0]) {
  const user = userEvent.setup();
  render(<BottleFormHarness {...props} />);
  await user.click(screen.getByRole('button', { name: 'open' }));
  return user;
}

function dialog() {
  return within(screen.getByRole('dialog'));
}

describe('BottleFormModal', () => {
  const categories = [buildCategory({ id: 1 })];

  it('sends a date typed in French as an ISO date', async () => {
    const onSubmit = vi.fn();
    const user = await renderOpenForm({ categories, onSubmit });

    await user.type(dialog().getByRole('textbox', { name: /bottles\.name/ }), 'Hendricks');
    await user.type(dialog().getByLabelText('bottles.openedAt'), '03/12/2024');
    await user.click(dialog().getByRole('button', { name: 'common.save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ openedAt: '2024-12-03' }), false);
  });

  it('shows the date of a saved bottle in French and sends it back unchanged', async () => {
    const onSubmit = vi.fn();
    const bottle = buildBottle({ openedAt: '2024-06-01T00:00:00.000Z' });
    const user = await renderOpenForm({ categories, bottle, onSubmit });

    expect(dialog().getByLabelText('bottles.openedAt')).toHaveValue('01/06/2024');
    await user.click(dialog().getByRole('button', { name: 'common.save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ openedAt: '2024-06-01' }), false);
  });

  it('does not send an impossible date', async () => {
    const onSubmit = vi.fn();
    const user = await renderOpenForm({ categories, onSubmit });

    await user.type(dialog().getByRole('textbox', { name: /bottles\.name/ }), 'Hendricks');
    await user.type(dialog().getByLabelText('bottles.openedAt'), '31/02/2024');
    await user.click(dialog().getByRole('button', { name: 'common.save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog().getByText('dates.invalid')).toBeInTheDocument();
  });
});
