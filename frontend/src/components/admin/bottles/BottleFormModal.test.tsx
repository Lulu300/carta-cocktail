import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildBottle, buildCategory, buildCategoryType } from '../../../test/factories';
import type { Bottle, Category } from '../../../types';
import { useEntityForm } from '../useEntityForm';
import BottleFormModal from './BottleFormModal';
import { toBottleForm, type BottleInput } from './bottleForm';
import i18n from '../../../i18n';

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

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

    await user.type(dialog().getByRole('textbox', { name: /Nom \(marque\)/ }), 'Hendricks');
    await user.type(dialog().getByLabelText('Ouverte le'), '03/12/2024');
    await user.click(dialog().getByRole('button', { name: 'Enregistrer' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ openedAt: '2024-12-03' }), false);
  });

  it('shows the date of a saved bottle in French and sends it back unchanged', async () => {
    const onSubmit = vi.fn();
    const bottle = buildBottle({ openedAt: '2024-06-01T00:00:00.000Z' });
    const user = await renderOpenForm({ categories, bottle, onSubmit });

    expect(dialog().getByLabelText('Ouverte le')).toHaveValue('01/06/2024');
    await user.click(dialog().getByRole('button', { name: 'Enregistrer' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ openedAt: '2024-06-01' }), false);
  });

  it('does not send an impossible date', async () => {
    const onSubmit = vi.fn();
    const user = await renderOpenForm({ categories, onSubmit });

    await user.type(dialog().getByRole('textbox', { name: /Nom \(marque\)/ }), 'Hendricks');
    await user.type(dialog().getByLabelText('Ouverte le'), '31/02/2024');
    await user.click(dialog().getByRole('button', { name: 'Enregistrer' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog().getByText(/^Saisissez une date valide au format .+$/)).toBeInTheDocument();
  });

  describe('category list, with type names HTML would hide', () => {
    // Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT', and a type with an empty name.
    const categoryOfType = (id: number, name: string, type: string, nameTranslations?: Record<string, string>) =>
      buildCategory({ id, name, type, categoryType: buildCategoryType({ name: type, nameTranslations }) });

    async function categoryOptions(categoryList: Category[]) {
      await renderOpenForm({ categories: categoryList, onSubmit: vi.fn() });
      return within(dialog().getByLabelText('Catégorie')).getAllByRole('option').map((option) => option.textContent);
    }

    it('tells the stored names apart, and labels the empty name', async () => {
      expect(await categoryOptions([
        categoryOfType(1, 'Rum', ' SPIRIT '),
        categoryOfType(2, 'Gin', 'SPIRIT'),
        categoryOfType(3, 'Water', ''),
        categoryOfType(4, 'Tonic', 'X  Y'),
      ])).toEqual([
        'Rum (␣SPIRIT␣ (avec espaces))',
        'Gin (SPIRIT)',
        'Water ((sans nom))',
        'Tonic (X␣␣Y (avec espaces))',
      ]);
      expect(dialog().getByRole('option', { name: 'Rum (␣SPIRIT␣ (avec espaces))' })).toBeInTheDocument();
    });

    it('adds the stored name to a translation that would hide it', async () => {
      const nameTranslations = { fr: 'Spiritueux' };
      expect(await categoryOptions([
        categoryOfType(1, 'Rum', ' SPIRIT ', nameTranslations),
        categoryOfType(2, 'Gin', 'SPIRIT', nameTranslations),
      ])).toEqual(['Rum (Spiritueux – ␣SPIRIT␣ (avec espaces))', 'Gin (Spiritueux)']);
    });

    it('marks the stored name of a category sent without its type', async () => {
      expect(await categoryOptions([buildCategory({ id: 1, name: 'Rum', type: ' SPIRIT ', categoryType: null })]))
        .toEqual(['Rum (␣SPIRIT␣ (avec espaces))']);
    });
  });
});
