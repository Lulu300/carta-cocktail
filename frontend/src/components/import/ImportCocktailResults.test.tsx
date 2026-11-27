import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import type { CocktailExportFormat } from '../../types';
import { initialCocktailImportState } from './importCocktailReducer';
import { ImportBatchSummary } from './ImportCocktailResults';

function recipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    cocktail: { name, description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  };
}

describe('ImportBatchSummary', () => {
  it('passes the number of imported recipes as the count that picks the plural form', () => {
    const state = {
      ...initialCocktailImportState,
      recipes: [recipe('Mojito'), recipe('Negroni'), recipe('Daiquiri')],
      results: { 0: { name: 'Mojito', success: true }, 1: { name: 'Negroni', success: false } },
    };

    render(<ImportBatchSummary state={state} onClose={vi.fn()} />);

    // Values are listed in the order the component passes them: count, success, total.
    expect(screen.getByText('1 of 3 imported successfully')).toBeInTheDocument();
  });
});
