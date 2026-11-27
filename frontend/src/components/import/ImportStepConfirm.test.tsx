import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  buildBottleRef,
  buildCategory,
  buildCategoryRef,
  buildIngredientRef,
  buildUnit,
  buildUnitRef,
} from '../../test/factories';
import type { ImportPreviewResponse } from '../../types';
import ImportStepConfirm from './ImportStepConfirm';
import { emptyResolutions } from './importResolutions';
import type { ImportReferenceLists } from './useImportReferenceLists';

const preview: ImportPreviewResponse = {
  cocktail: { name: 'Daiquiri', description: 'Fresh and sour', tags: [], alreadyExists: false },
  units: [
    {
      ref: buildUnitRef({ name: 'Centilitre', abbreviation: 'cl' }),
      existingMatch: buildUnit({ id: 1, name: 'Centilitre', abbreviation: 'cl' }),
      status: 'matched',
    },
  ],
  categories: [
    {
      ref: buildCategoryRef({ name: 'Rhum' }),
      existingMatch: buildCategory({ id: 10, name: 'Rhum' }),
      status: 'matched',
    },
  ],
  bottles: [{ ref: buildBottleRef({ name: 'Havana 3' }), existingMatch: null, status: 'missing' }],
  ingredients: [
    { ref: buildIngredientRef({ name: 'Lime' }), existingMatch: null, status: 'missing' },
  ],
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
  render(
    <ImportStepConfirm
      preview={preview}
      resolutions={resolutions()}
      lists={lists}
      isLoading={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ImportStepConfirm', () => {
  it('shows the existing entity the admin picked, not the one the backend matched', () => {
    renderConfirm();

    const rhum = screen.getByText('Rhum').closest('li');
    expect(rhum).toHaveTextContent('Rhum→maps toRhum ambré');
    // A unit is named with its abbreviation on both sides
    expect(screen.getAllByText('Centilitre (cl)')).toHaveLength(2);
  });

  it('falls back on the backend match while the lists are loading', () => {
    renderConfirm({ lists: { ...lists, units: [], categories: [] } });

    expect(screen.getByText('Centilitre (cl)').closest('li')).toHaveTextContent(
      'Centilitre (cl)→maps toCentilitre',
    );
    // Another entity than the match: its name is unknown until the lists arrive
    expect(screen.getByText('Rhum').closest('li')).toHaveTextContent('Rhum→maps to?');
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

    await user.click(screen.getByText('Confirm import'));
    await user.click(screen.getByText('Back'));

    expect(onConfirm).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it('blocks both buttons while importing', () => {
    renderConfirm({ isLoading: true });

    expect(screen.getByText('Importing...').closest('button')).toBeDisabled();
    expect(screen.getByText('Back').closest('button')).toBeDisabled();
  });
});
