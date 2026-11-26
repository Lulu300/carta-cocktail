import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Category, CategoryType, EntityResolutionAction, ImportEntityResolution, Unit } from '../../types';
import ImportEntityRow from './ImportEntityRow';
import { defaultCreateData, type ImportEntityType } from './importResolutions';
import type { ExistingOption } from './useImportReferenceLists';
import { buildCategory, buildCategoryType, buildUnit } from '../../test/factories';

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

    const name = screen.getByLabelText(/Name \(brand\)/);
    await user.clear(name);

    expect(name).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ name: '' }) });
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('turns an emptied number field into null, never NaN', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    const capacity = screen.getByLabelText(/Capacity \(ml\)/);
    await user.clear(capacity);

    expect(capacity).toHaveValue(null);
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ capacityMl: null }) });
    expect(screen.getByText('Enter a whole number of ml, greater than 0')).toBeInTheDocument();

    await user.type(capacity, '750');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ capacityMl: 750 }) });
    expect(screen.queryByText('Enter a whole number of ml, greater than 0')).not.toBeInTheDocument();
  });

  it('disables "use existing" when nothing can be picked', () => {
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} />);

    expect(screen.getByRole('button', { name: 'Use existing' })).toBeDisabled();
  });

  it('picks the first bottle of the same category when switching to an existing one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      { id: 1, name: 'Gordon', category: { name: 'Gin' } },
      { id: 2, name: 'Havana 7', category: { name: 'rhum' } },
    ];
    render(<Harness entity={missingBottle} type="bottles" existingOptions={options} initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Use existing' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
    expect(screen.getByRole('option', { name: 'Havana 7' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Gordon' })).not.toBeInTheDocument();
  });

  // Compared like the backend compares category names (C-65): case and Unicode form ignored
  it.each([
    ['decomposed, the existing one composed', 'CRE\u0300ME', 'Cr\u00E8me'],
    ['composed, the existing one decomposed', 'CR\u00C8ME', 'Cre\u0300me'],
  ])('lists the bottles of a category written %s', async (_case, fileCategory, existingCategory) => {
    const user = userEvent.setup();
    const bottle: ImportEntityResolution = { ref: { name: 'Cassis', categoryName: fileCategory }, existingMatch: null, status: 'missing' };
    const options = [
      { id: 1, name: 'Gordon', category: { name: 'Gin' } },
      { id: 2, name: 'Lejay', category: { name: existingCategory } },
    ];
    render(<Harness entity={bottle} type="bottles" existingOptions={options} initial={createResolution('bottles', bottle)} />);

    await user.click(screen.getByRole('button', { name: 'Use existing' }));

    expect(screen.getByRole('option', { name: 'Lejay' })).toBeInTheDocument();
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
    await user.selectOptions(screen.getByLabelText('Existing entry'), 'Millilitre (ml)');

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
  });

  it('keeps the matched entity selectable while the lists are loading', async () => {
    const user = userEvent.setup();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: { id: 9, name: 'Mint' }, status: 'matched' };
    render(<Harness entity={ingredient} type="ingredients" initial={{ action: 'use_existing', existingId: 9 }} />);

    await user.click(screen.getByRole('button', { name: /Mint/ }));

    expect(screen.getByRole('button', { name: 'Use existing' })).toBeEnabled();
    expect(screen.getByLabelText('Existing entry')).toHaveValue('9');
  });

  it('goes back to the backend match, not the first option, when "use existing" is chosen again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: { id: 9, name: 'Mint' }, status: 'matched' };
    const options = [{ id: 3, name: 'Basil' }, { id: 9, name: 'Mint' }];
    render(<Harness entity={ingredient} type="ingredients" existingOptions={options} initial={{ action: 'use_existing', existingId: 9 }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Mint/ }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('button', { name: 'Use existing' }));

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
    expect(screen.getByLabelText(/Type/)).toHaveValue('SYRUP');

    await user.clear(screen.getByLabelText(/Desired stock \(sealed bottles\)/));
    expect(screen.getByText('Enter a whole number, 0 or more')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ desiredStock: null }) });

    await user.selectOptions(screen.getByLabelText(/Type/), 'Spirits');
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ type: 'SPIRIT' }) });
  });

  it('flags the type with an empty name until another type is chosen', async () => {
    const user = userEvent.setup();
    const category: ImportEntityResolution = { ref: { name: 'Sirop', type: 'SYRUP', desiredStock: 1 }, existingMatch: null, status: 'missing' };
    const categoryTypes = [buildCategoryType({ name: 'SYRUP' }), buildCategoryType({ name: '' }), buildCategoryType({ name: ' SPIRIT ' })];
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} categoryTypes={categoryTypes} />);
    const typeSelect = screen.getByLabelText(/Type/);

    await user.selectOptions(typeSelect, '(no name)');
    expect(typeSelect).toHaveValue('');
    expect(typeSelect).toHaveAttribute('aria-invalid', 'true');
    expect(typeSelect).toHaveAccessibleDescription('Choose or enter a type with a name.');

    // A type whose name only has spaces around it can be picked
    await user.selectOptions(typeSelect, ' SPIRIT ');
    expect(typeSelect).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Choose or enter a type with a name.')).not.toBeInTheDocument();
  });

  it('flags a file type made only of invisible characters, which the backend would refuse to create', () => {
    const category: ImportEntityResolution = { ref: { name: 'Sirop', type: '\u200B', desiredStock: 1 }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} categoryTypes={[buildCategoryType({ name: 'SYRUP' })]} />);

    expect(screen.getByText('Choose or enter a type with a name.')).toBeInTheDocument();
  });

  it('keeps the file type selectable before the types are loaded', () => {
    const category: ImportEntityResolution = { ref: { name: 'Bitter', type: 'BITTER' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" initial={createResolution('categories', category)} />);

    expect(screen.getByLabelText(/Type/)).toHaveValue('BITTER');
  });

  it('accepts a unit without a name: titled and named after its abbreviation', () => {
    const unit: ImportEntityResolution = { ref: { abbreviation: 'cl' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={unit} type="units" initial={createResolution('units', unit)} />);

    expect(screen.getByRole('button', { name: /^cl/ })).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveValue('cl');
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('edits the abbreviation of a unit to create', async () => {
    const user = userEvent.setup();
    const unit: ImportEntityResolution = { ref: { name: 'Dash', abbreviation: 'dash' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={unit} type="units" initial={createResolution('units', unit)} />);

    await user.clear(screen.getByLabelText(/Abbreviation/));

    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('skips a bottle and creates it again with its defaults', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness entity={missingBottle} type="bottles" initial={createResolution('bottles', missingBottle)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onChange).toHaveBeenLastCalledWith({ action: 'skip' });
    expect(screen.queryByLabelText(/Name \(brand\)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: defaultCreateData('bottles', missingBottle.ref) });
  });

  it('picks an icon for an ingredient to create', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ingredient: ImportEntityResolution = { ref: { name: 'Mint' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={ingredient} type="ingredients" initial={createResolution('ingredients', ingredient)} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Emoji 🌿' }));

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

    expect(screen.getByText('Several matches')).toBeInTheDocument();
    expect(screen.getByText('Several existing ones differ only by case: Rhum, RHUM. Use one of them, or create it under another name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use existing' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Existing entry')).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses the match the admin picks', async () => {
    const user = userEvent.setup();
    const onChange = renderAmbiguous();

    await user.selectOptions(screen.getByLabelText('Existing entry'), 'RHUM');

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: 2 });
    expect(screen.queryByRole('option', { name: '— Pick one of them —' })).not.toBeInTheDocument();
  });

  it('comes back to "use existing" without a match picked', async () => {
    const user = userEvent.setup();
    const onChange = renderAmbiguous(vi.fn(), { action: 'create', data: defaultCreateData('categories', ambiguousCategory.ref) });

    await user.click(screen.getByRole('button', { name: 'Use existing' }));

    expect(onChange).toHaveBeenLastCalledWith({ action: 'use_existing', existingId: undefined });
    expect(screen.getByLabelText('Existing entry')).toHaveValue('');
  });

  it('refuses to create it under a name the matches hold, until another name is typed', async () => {
    const user = userEvent.setup();
    renderAmbiguous();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    const name = screen.getByLabelText(/Name/);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Matches Rhum, RHUM, which differ only by case: use one of them, or change this value.');

    await user.type(name, ' blanc');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(name).not.toHaveAccessibleDescription();
  });

  it('says that a category to create that exists ignoring case is used as it is', async () => {
    const user = userEvent.setup();
    const category: ImportEntityResolution = { ref: { name: 'Vodka', type: 'SPIRIT' }, existingMatch: null, status: 'missing' };
    render(<Harness entity={category} type="categories" categories={categories} initial={createResolution('categories', category)} />);
    const name = screen.getByLabelText(/Name/);
    expect(name).not.toHaveAccessibleDescription();

    await user.clear(name);
    await user.type(name, 'GIN');
    expect(name).toHaveAccessibleDescription('Already exists as "Gin": it will be used as it is, and the other fields are ignored.');
    expect(name).not.toHaveAttribute('aria-invalid');

    // The exact name of one of the twins is that one, not an ambiguity
    await user.clear(name);
    await user.type(name, 'RHUM');
    expect(name).toHaveAccessibleDescription('Already exists as "RHUM": it will be used as it is, and the other fields are ignored.');
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
    expect(screen.getByText('Several existing ones differ only by case: CL, Cl. Use one of them, or create it under another name.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    const abbreviation = screen.getByLabelText(/Abbreviation/);
    expect(abbreviation).toHaveAccessibleDescription('Matches Centilitre (CL), Centilitre (Cl), which differ only by case: use one of them, or change this value.');
    expect(screen.getByLabelText(/Name/)).not.toHaveAccessibleDescription();

    await user.clear(abbreviation);
    await user.type(abbreviation, 'Cl');
    expect(abbreviation).toHaveAccessibleDescription('Already exists as "Centilitre (Cl)": it will be used as it is, and the other fields are ignored.');
  });
});
