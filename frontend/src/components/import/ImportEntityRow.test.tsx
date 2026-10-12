import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryType, EntityResolutionAction, ImportEntityResolution } from '../../types';
import ImportEntityRow from './ImportEntityRow';
import { defaultCreateData, type ImportEntityType } from './importResolutions';
import type { ExistingOption } from './useImportReferenceLists';

interface HarnessProps {
  entity: ImportEntityResolution;
  type: ImportEntityType;
  existingOptions?: ExistingOption[];
  initial?: EntityResolutionAction;
  onChange?: (resolution: EntityResolutionAction) => void;
  categoryTypes?: CategoryType[];
}

/** Holds the resolution like the resolve step does. */
function Harness({ entity, type, existingOptions = [], initial, onChange, categoryTypes }: HarnessProps) {
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
      categoryTypes={categoryTypes}
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

    // The i18n mock gives every emoji the same name: pick the 🌿 button among them.
    const emojiButtons = screen.getAllByRole('button', { name: 'iconPicker.emoji' });
    await user.click(emojiButtons.find((button) => button.textContent === '🌿')!);

    expect(onChange).toHaveBeenLastCalledWith({ action: 'create', data: expect.objectContaining({ icon: '🌿' }) });
  });
});
