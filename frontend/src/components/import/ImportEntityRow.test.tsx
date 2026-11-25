import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Category, CategoryType, EntityResolutionAction, ImportEntityResolution, Unit } from '../../types';
import ImportEntityRow from './ImportEntityRow';
import { defaultCreateData, type ImportEntityType } from './importResolutions';
import type { ExistingOption } from './useImportReferenceLists';
import { buildCategory, buildCategoryType, buildUnit } from '../../test/factories';

// Shows the names a message interpolates: "importMatches.pickOne(Rhum, RHUM)"
vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

interface HarnessProps {
  entity: ImportEntityResolution;
  type: ImportEntityType;
  existingOptions?: ExistingOption[];
  initial?: EntityResolutionAction;
  onChange?: (resolution: EntityResolutionAction) => void;
  categoryTypes?: CategoryType[];
  categories?: Category[];
  units?: Unit[];
}

/** Holds the resolution like the resolve step does. */
function Harness({ entity, type, existingOptions = [], initial, onChange, categoryTypes = [], categories = [], units = [] }: HarnessProps) {
  const [resolution, setResolution] = useState(initial);
  return (
    <ImportEntityRow
      entity={entity}
      type={type}
      existingOptions={existingOptions}
      resolution={resolution}
      onChange={(next) => {
        setResolution(next);
        onChange?.(next);
      }}
      allowSkip={type === 'bottles'}
      existingRows={{ categoryTypes, categories, units }}
    />
  );
}

const missingBottle: ImportEntityResolution = {
  ref: { name: 'Havana 3', categoryName: 'Rhum' },
  existingMatch: null,
  status: 'missing',
};

function createResolution(type: ImportEntityType, entity: ImportEntityResolution): EntityResolutionAction {
  return { action: 'create', data: defaultCreateData(type, entity.ref) };
}

describe('ImportEntityRow', () => {
  it('lets the admin clear the name, and flags it as required', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    const name = screen.getByLabelText(/bottles\.name/);
    await user.clear(name);

    expect(name).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ name: '' }) });
    expect(screen.getByText('cocktails.importWizard.fieldRequired')).toBeInTheDocument();
  });

  it('turns an emptied number field into null, never NaN', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    const capacity = screen.getByLabelText(/bottles\.capacityMl/);
    await user.clear(capacity);

    expect(capacity).toHaveValue(null);
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ capacityMl: null }) });
    expect(screen.getByText('cocktails.importWizard.capacityInvalid')).toBeInTheDocument();

    await user.type(capacity, '750');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ capacityMl: 750 }) });
    expect(screen.queryByText('cocktails.importWizard.capacityInvalid')).not.toBeInTheDocument();
  });

  it('disables "use existing" when nothing can be picked', () => {
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} />);

    expect(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' })).toBeDisabled();
  });

  it('picks the first bottle of the same category when switching to an existing one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      { id: 1, name: 'Gordon', category: { name: 'Gin' } },
      { id: 2, name: 'Havana 7', category: { name: 'rhum' } },
    ];
    render(<Harness entity={missingBottle} type="bottles" existingOptions={options} initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
    expect(screen.getByRole('option', { name: 'Havana 7' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Gordon' })).not.toBeInTheDocument();
  });

  it('maps a unit to another existing one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const unit: ImportEntityResolution = {
      ref: { name: 'Centilitre', abbreviation: 'cl' },
      existingMatch: { id: 1, name: 'Centilitre' },
      status: 'matched',
    };
    const options = [
      { id: 1, name: 'Centilitre', abbreviation: 'cl' },
      { id: 2, name: 'Millilitre', abbreviation: 'ml' },
    ];
    render(<Harness entity={unit} type="units" existingOptions={options} initial={{ action: 'use_existing', existingId: 1 }} onChange={onChange} />);

    // A matched entity starts collapsed
    await user.click(screen.getByRole('button', { name: /Centilitre \(cl\)/ }));
    await user.selectOptions(screen.getByLabelText('cocktails.importWizard.existingEntity'), 'Millilitre (ml)');

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
  });

  it('keeps the matched entity selectable while the lists are loading', async () => {
    const user = userEvent.setup();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: { id: 9, name: 'Mint' }, status: 'matched' };
    render(<Harness entity={ingredient} type="ingredients" initial={{ action: 'use_existing', existingId: 9 }} />);

    await user.click(screen.getByRole('button', { name: /Mint/ }));

    expect(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' })).toBeEnabled();
    expect(screen.getByLabelText('cocktails.importWizard.existingEntity')).toHaveValue('9');
  });

  it('goes back to the backend match, not the first option, when "use existing" is chosen again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: { id: 9, name: 'Mint' }, status: 'matched' };
    const options = [{ id: 3, name: 'Basil' }, { id: 9, name: 'Mint' }];
    render(<Harness entity={ingredient} type="ingredients" existingOptions={options} initial={{ action: 'use_existing', existingId: 9 }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Mint/ }));
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.createNew' }));
    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 9 });
  });

  it('shows the category types in the interface language, and the desired stock', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const category: ImportEntityResolution = { ref: { name: 'Sirop', type: 'SYRUP', desiredStock: 1 }, existingMatch: null, status: 'missing' };
    const categoryTypes = [
      { name: 'SPIRIT', color: 'amber', nameTranslations: { fr: 'Spiritueux', en: 'Spirits' } },
      { name: 'SYRUP', color: 'pink', nameTranslations: { fr: 'Sirop', en: 'Syrup' } },
    ];
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} onChange={onChange} categoryTypes={categoryTypes} />);

    expect(screen.getByRole('option', { name: 'Spirits' })).toBeInTheDocument();
    expect(screen.getByLabelText(/categories\.type/)).toHaveValue('SYRUP');

    await user.clear(screen.getByLabelText(/cocktails\.importWizard\.desiredStock/));
    expect(screen.getByText('cocktails.importWizard.desiredStockInvalid')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ desiredStock: null }) });

    await user.selectOptions(screen.getByLabelText(/categories\.type/), 'Spirits');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ type: 'SPIRIT' }) });
  });

  it('flags the type with an empty name until another type is chosen', async () => {
    const user = userEvent.setup();
    const category: ImportEntityResolution = { ref: { name: 'Sirop', type: 'SYRUP', desiredStock: 1 }, existingMatch: null, status: 'missing' };
    const categoryTypes = [buildCategoryType({ name: 'SYRUP' }), buildCategoryType({ name: '' }), buildCategoryType({ name: ' SPIRIT ' })];
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} categoryTypes={categoryTypes} />);
    const typeSelect = screen.getByLabelText(/categories\.type/);

    await user.selectOptions(typeSelect, 'categoryTypes.emptyName');
    expect(typeSelect).toHaveValue('');
    expect(typeSelect).toHaveAttribute('aria-invalid', 'true');
    expect(typeSelect).toHaveAccessibleDescription('categories.typeRequired');

    // A type whose name only has spaces around it can be picked
    await user.selectOptions(typeSelect, ' SPIRIT ');
    expect(typeSelect).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('categories.typeRequired')).not.toBeInTheDocument();
  });

  it('flags a file type made only of invisible characters, which the backend would refuse to create', () => {
    const category: ImportEntityResolution = { ref: { name: 'Sirop', type: '\u200B', desiredStock: 1 }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} categoryTypes={[buildCategoryType({ name: 'SYRUP' })]} />);

    expect(screen.getByText('categories.typeRequired')).toBeInTheDocument();
  });

  it('keeps the file type selectable before the types are loaded', () => {
    const category: ImportEntityResolution = { ref: { name: 'Bitter', type: 'BITTER' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} />);

    expect(screen.getByLabelText(/categories\.type/)).toHaveValue('BITTER');
  });

  it('accepts a unit without a name: titled and named after its abbreviation', () => {
    const unit: ImportEntityResolution = { ref: { abbreviation: 'cl' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={unit} type="units" initial={createResolution('units', unit)} />);

    expect(screen.getByRole('button', { name: /^cl/ })).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/units\.name/)).toHaveValue('cl');
    expect(screen.queryByText('cocktails.importWizard.fieldRequired')).not.toBeInTheDocument();
  });

  it('edits the abbreviation of a unit to create', async () => {
    const user = userEvent.setup();
    const unit: ImportEntityResolution = { ref: { name: 'Dash', abbreviation: 'dash' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={unit} type="units" initial={createResolution('units', unit)} />);

    await user.clear(screen.getByLabelText(/units\.abbreviation/));

    expect(screen.getByText('cocktails.importWizard.fieldRequired')).toBeInTheDocument();
  });

  it('skips a bottle and creates it again with its defaults', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.skip' }));
    expect(onChange).toHaveBeenLastCalledWith({ action: 'skip' });
    expect(screen.queryByLabelText(/bottles\.name/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.createNew' }));
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: defaultCreateData('bottles', missingBottle.ref) });
  });

  it('picks an icon for an ingredient to create', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={ingredient} type="ingredients" initial={createResolution('ingredients', ingredient)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'iconPicker.emoji(🌿)' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ icon: '🌿' }) });
  });
});

// Data older than C-07 can hold two categories or two units that differ only by case (C-19)
describe('ImportEntityRow - rows equal ignoring case', () => {
  const rhum = buildCategory({ id: 1, name: 'Rhum' });
  const upperRhum = buildCategory({ id: 2, name: 'RHUM' });
  const gin = buildCategory({ id: 3, name: 'Gin' });
  const categories = [rhum, upperRhum, gin];
  const ambiguousCategory: ImportEntityResolution = {
    ref: { name: 'rhum', type: 'SPIRIT', desiredStock: 1 },
    existingMatch: null,
    status: 'ambiguous',
    ambiguousMatches: [{ id: 1, name: 'Rhum' }, { id: 2, name: 'RHUM' }],
  };

  function renderAmbiguous(onChange = vi.fn(), initial?: EntityResolutionAction) {
    render(
      <Harness entity={ambiguousCategory} type="categories" existingOptions={categories} categories={categories} initial={initial} onChange={onChange} />,
    );
    return onChange;
  }

  it('names the matches and picks none of them for the admin', () => {
    const onChange = renderAmbiguous();

    expect(screen.getByText('importMatches.ambiguous')).toBeInTheDocument();
    expect(screen.getByText('importMatches.pickOne(Rhum, RHUM)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('cocktails.importWizard.existingEntity')).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses the match the admin picks', async () => {
    const user = userEvent.setup();
    const onChange = renderAmbiguous();

    await user.selectOptions(screen.getByLabelText('cocktails.importWizard.existingEntity'), 'RHUM');

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
    expect(screen.queryByRole('option', { name: 'importMatches.pickMatch' })).not.toBeInTheDocument();
  });

  it('comes back to "use existing" without a match picked', async () => {
    const user = userEvent.setup();
    const onChange = renderAmbiguous(vi.fn(), { action: 'create', data: defaultCreateData('categories', ambiguousCategory.ref) });

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.useExisting' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: undefined });
    expect(screen.getByLabelText('cocktails.importWizard.existingEntity')).toHaveValue('');
  });

  it('refuses to create it under a name the matches hold, until another name is typed', async () => {
    const user = userEvent.setup();
    renderAmbiguous();

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.createNew' }));
    const name = screen.getByLabelText(/categories\.name/);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('importMatches.ambiguousName(Rhum, RHUM)');

    await user.type(name, ' blanc');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(name).not.toHaveAccessibleDescription();
  });

  it('says that a category to create that exists ignoring case is used as it is', async () => {
    const user = userEvent.setup();
    const category: ImportEntityResolution = { ref: { name: 'Vodka', type: 'SPIRIT' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" categories={categories} initial={createResolution('categories', category)} />);
    const name = screen.getByLabelText(/categories\.name/);
    expect(name).not.toHaveAccessibleDescription();

    await user.clear(name);
    await user.type(name, 'GIN');
    expect(name).toHaveAccessibleDescription('importMatches.usedAsItIs(Gin)');
    expect(name).not.toHaveAttribute('aria-invalid');

    // The exact name of one of the twins is that one, not an ambiguity
    await user.clear(name);
    await user.type(name, 'RHUM');
    expect(name).toHaveAccessibleDescription('importMatches.usedAsItIs(RHUM)');
  });

  it('compares a unit by its abbreviation only', async () => {
    const user = userEvent.setup();
    const units = [buildUnit({ id: 1, name: 'Centilitre', abbreviation: 'CL' }), buildUnit({ id: 2, name: 'Centilitre', abbreviation: 'Cl' })];
    const unit: ImportEntityResolution = {
      ref: { name: 'Centilitre', abbreviation: 'cl' },
      existingMatch: null,
      status: 'ambiguous',
      ambiguousMatches: [{ id: 1, name: 'CL' }, { id: 2, name: 'Cl' }],
    };
    render(<Harness entity={unit} type="units" existingOptions={units} units={units} />);
    expect(screen.getByText('importMatches.pickOne(CL, Cl)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'cocktails.importWizard.createNew' }));
    const abbreviation = screen.getByLabelText(/units\.abbreviation/);
    expect(abbreviation).toHaveAccessibleDescription('importMatches.ambiguousName(Centilitre (CL), Centilitre (Cl))');
    expect(screen.getByLabelText(/units\.name/)).not.toHaveAccessibleDescription();

    await user.clear(abbreviation);
    await user.type(abbreviation, 'Cl');
    expect(abbreviation).toHaveAccessibleDescription('importMatches.usedAsItIs(Centilitre (Cl))');
  });
});
