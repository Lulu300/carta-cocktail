import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportPreviewResponse } from '../../types';
import ImportStepConfirm from './ImportStepConfirm';
import { emptyResolutions } from './importResolutions';
import type { ImportReferenceLists } from './useImportReferenceLists';

const preview: ImportPreviewResponse = {
  cocktail: { name: 'Daiquiri', description: 'Fresh and sour', tags: [], alreadyExists: false },
  units: [{ ref: { name: 'Centilitre', abbreviation: 'cl' }, existingMatch: { id: 1, name: 'Centilitre' }, status: 'matched' }],
  categories: [{ ref: { name: 'Rhum' }, existingMatch: { id: 10, name: 'Rhum' }, status: 'matched' }],
  bottles: [{ ref: { name: 'Havana 3', categoryName: 'Rhum' }, existingMatch: null, status: 'missing' }],
  ingredients: [{ ref: { name: 'Lime' }, existingMatch: null, status: 'missing' }],
};

const lists: ImportReferenceLists = {
  units: [{ id: 1, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 }],
  categories: [
    { id: 10, name: 'Rhum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30 },
    { id: 11, name: 'Rhum ambré', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30 },
  ],
  bottles: [],
  ingredients: [],
  categoryTypes: [],
  hasError: false,
} as unknown as ImportReferenceLists;

function resolutions() {
  return {
    ...emptyResolutions(),
    units: { cl: { action: 'use_existing' as const, existingId: 1 } },
    categories: { rhum: { action: 'use_existing' as const, existingId: 11 } },
    bottles: { 'havana 3': { action: 'skip' as const } },
    ingredients: { lime: { action: 'create' as const, data: { name: 'Lime juice' } } },
  };
}

function renderConfirm(props: Partial<Parameters<typeof ImportStepConfirm>[0]> = {}) {
  const handlers = { onBack: vi.fn(), onConfirm: vi.fn() };
  render(<ImportStepConfirm preview={preview} resolutions={resolutions()} lists={lists} isLoading={false} {...handlers} {...props} />);
  return handlers;
}

describe('ImportStepConfirm', () => {
  it('shows the existing entity the admin picked, not the one the backend matched', () => {
    renderConfirm();

    const rhum = screen.getByText('Rhum').closest('li');
    expect(rhum).toHaveTextContent('Rhum→Rhum ambré');
    expect(screen.getByText('Centilitre (cl)')).toBeInTheDocument();
  });

  it('falls back on the backend match while the lists are loading', () => {
    renderConfirm({ lists: { ...lists, units: [], categories: [] } });

    expect(screen.getAllByText('Centilitre')[0].closest('li')).toHaveTextContent('Centilitre→Centilitre');
    // Another entity than the match: its name is unknown until the lists arrive
    expect(screen.getByText('Rhum').closest('li')).toHaveTextContent('Rhum→?');
  });

  it('lists the entities to create under their edited name, and the skipped ones', () => {
    renderConfirm();

    expect(screen.getByText('Lime juice')).toBeInTheDocument();
    expect(screen.getByText('Havana 3')).toBeInTheDocument();
    expect(screen.getByText('Daiquiri')).toBeInTheDocument();
    expect(screen.getByText('Fresh and sour')).toBeInTheDocument();
  });

  it('confirms or goes back', async () => {
    const user = userEvent.setup();
    const { onBack, onConfirm } = renderConfirm();

    await user.click(screen.getByText('cocktails.importWizard.confirmImport'));
    await user.click(screen.getByText('cocktails.importWizard.back'));

    expect(onConfirm).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it('blocks both buttons while importing', () => {
    renderConfirm({ isLoading: true });

    expect(screen.getByText('cocktails.importWizard.importing').closest('button')).toBeDisabled();
    expect(screen.getByText('cocktails.importWizard.back').closest('button')).toBeDisabled();
  });
});
