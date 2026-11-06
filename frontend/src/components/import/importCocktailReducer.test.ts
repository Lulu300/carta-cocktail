import { describe, it, expect } from 'vitest';
import type { CocktailExportFormat, ImportPreviewResponse } from '../../types';
import {
  canGoBack,
  importCocktailReducer,
  initialCocktailImportState,
  type CocktailImportAction,
  type CocktailImportState,
} from './importCocktailReducer';
import { emptyResolutions } from './importResolutions';

function recipe(name: string): CocktailExportFormat {
  return {
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    cocktail: { name, description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  };
}

const preview: ImportPreviewResponse = {
  cocktail: { name: 'Mojito', description: null, tags: [], alreadyExists: false },
  units: [],
  categories: [],
  bottles: [],
  ingredients: [{ ref: { name: 'Mint' }, existingMatch: null, status: 'missing' }],
};

function run(state: CocktailImportState, ...actions: CocktailImportAction[]): CocktailImportState {
  return actions.reduce(importCocktailReducer, state);
}

function loaded(...names: string[]): CocktailImportState {
  return run(initialCocktailImportState, { type: 'LOADED', recipes: names.map(recipe) });
}

const toConfirm: CocktailImportAction[] = [
  { type: 'PREVIEW_REQUESTED' },
  { type: 'PREVIEW_OK', preview },
  { type: 'NEXT' },
];

describe('importCocktailReducer', () => {
  it('loads the recipes and starts over', () => {
    const previous = run(loaded('Mojito'), ...toConfirm, { type: 'CONFIRM_FAILED', message: 'Boom' });

    const state = run(previous, { type: 'LOADED', recipes: [recipe('Negroni')] });

    expect(state).toEqual({ ...initialCocktailImportState, recipes: [recipe('Negroni')] });
  });

  it('requests the preview, then resolves the entities automatically', () => {
    const requested = run(loaded('Mojito'), { type: 'PREVIEW_REQUESTED' });
    expect(requested.step).toBe('previewing');

    const state = run(requested, { type: 'PREVIEW_OK', preview });
    expect(state.step).toBe('resolve');
    expect(state.preview).toBe(preview);
    expect(state.resolutions.ingredients.mint).toEqual({
      action: 'create',
      data: { name: 'Mint', icon: null, nameTranslations: null },
    });
  });

  it('keeps the choices the admin makes', () => {
    const resolutions = { ...emptyResolutions(), ingredients: { mint: { action: 'skip' as const } } };

    const state = run(loaded('Mojito'), { type: 'RESOLUTIONS_CHANGED', resolutions });

    expect(state.resolutions).toBe(resolutions);
  });

  it('moves to the confirmation only from the resolve step', () => {
    expect(run(loaded('Mojito'), { type: 'NEXT' }).step).toBe('upload');
    expect(run(loaded('Mojito'), ...toConfirm).step).toBe('confirm');
  });

  it('shows the success screen for a single recipe', () => {
    const state = run(loaded('Mojito'), ...toConfirm, { type: 'CONFIRM_OK', cocktail: { id: 7, name: 'Mojito' } });

    expect(state.step).toBe('success');
    expect(state.results).toEqual({ 0: { name: 'Mojito', success: true, id: 7 } });
  });

  it('moves to the next recipe of a batch after a success, then to the summary', () => {
    const second = run(loaded('Mojito', 'Negroni'), ...toConfirm, { type: 'CONFIRM_OK', cocktail: { id: 7, name: 'Mojito' } });
    expect(second).toMatchObject({ step: 'previewing', currentIndex: 1, preview: null, resolutions: emptyResolutions() });

    const done = run(second, { type: 'PREVIEW_OK', preview }, { type: 'NEXT' }, { type: 'CONFIRM_OK', cocktail: { id: 8, name: 'Negroni' } });
    expect(done.step).toBe('batchSummary');
    expect(Object.keys(done.results)).toEqual(['0', '1']);
  });

  it('records a failed confirmation, then replaces it when the retry succeeds', () => {
    const failed = run(loaded('Mojito', 'Negroni', 'Daiquiri'), ...toConfirm, { type: 'CONFIRM_OK', cocktail: { id: 1, name: 'Mojito' } },
      { type: 'PREVIEW_OK', preview }, { type: 'NEXT' }, { type: 'CONFIRM_FAILED', message: 'Boom' });
    expect(failed).toMatchObject({ step: 'error', error: 'Boom', failedRequest: 'confirm' });
    expect(failed.results[1]).toEqual({ name: 'Negroni', success: false });

    const retried = run(failed, { type: 'RETRY' });
    expect(retried).toMatchObject({ step: 'resolve', error: null, preview });

    const done = run(retried, { type: 'NEXT' }, { type: 'CONFIRM_OK', cocktail: { id: 2, name: 'Negroni' } },
      { type: 'PREVIEW_OK', preview }, { type: 'NEXT' }, { type: 'CONFIRM_OK', cocktail: { id: 3, name: 'Daiquiri' } });
    expect(done.step).toBe('batchSummary');
    expect(Object.values(done.results)).toEqual([
      { name: 'Mojito', success: true, id: 1 },
      { name: 'Negroni', success: true, id: 2 },
      { name: 'Daiquiri', success: true, id: 3 },
    ]);
  });

  it('shows an error screen when the preview of a recipe in the batch fails', () => {
    const state = run(loaded('Mojito', 'Negroni'), ...toConfirm, { type: 'CONFIRM_OK', cocktail: { id: 1, name: 'Mojito' } },
      { type: 'PREVIEW_FAILED', message: 'Invalid recipe' });

    expect(state).toMatchObject({ step: 'error', currentIndex: 1, preview: null, error: 'Invalid recipe', failedRequest: 'preview' });
    expect(canGoBack(state)).toBe(false);
  });

  it('requests the preview again on retry after a failed preview', () => {
    const state = run(loaded('Mojito'), { type: 'PREVIEW_REQUESTED' }, { type: 'PREVIEW_FAILED', message: 'Down' }, { type: 'RETRY' });

    expect(state).toMatchObject({ step: 'previewing', error: null, failedRequest: null });
  });

  it('ignores a retry outside the error screen', () => {
    const state = loaded('Mojito');

    expect(run(state, { type: 'RETRY' })).toBe(state);
  });

  it('skips a failed recipe: recorded as not imported, the batch goes on', () => {
    const failed = run(loaded('Mojito', 'Negroni'), { type: 'PREVIEW_REQUESTED' }, { type: 'PREVIEW_FAILED', message: 'Down' });

    const next = run(failed, { type: 'SKIP' });
    expect(next).toMatchObject({ step: 'previewing', currentIndex: 1, error: null });
    expect(next.results).toEqual({ 0: { name: 'Mojito', success: false } });

    const done = run(next, { type: 'PREVIEW_FAILED', message: 'Down' }, { type: 'SKIP' });
    expect(done.step).toBe('batchSummary');
    expect(done.results[1]).toEqual({ name: 'Negroni', success: false });
  });

  describe('BACK', () => {
    it('goes from the confirmation to the resolve step', () => {
      expect(run(loaded('Mojito'), ...toConfirm, { type: 'BACK' }).step).toBe('resolve');
    });

    it('goes back to the file from the first recipe only', () => {
      const first = run(loaded('Mojito', 'Negroni'), { type: 'PREVIEW_REQUESTED' }, { type: 'PREVIEW_OK', preview });
      expect(canGoBack(first)).toBe(true);
      expect(run(first, { type: 'BACK' }).step).toBe('upload');

      const second = run(first, { type: 'NEXT' }, { type: 'CONFIRM_OK', cocktail: { id: 1, name: 'Mojito' } }, { type: 'PREVIEW_OK', preview });
      expect(canGoBack(second)).toBe(false);
      expect(run(second, { type: 'BACK' })).toBe(second);
    });

    it('goes back to the file after the first preview failed', () => {
      const failed = run(loaded('Mojito'), { type: 'PREVIEW_REQUESTED' }, { type: 'PREVIEW_FAILED', message: 'Down' });

      expect(canGoBack(failed)).toBe(true);
      expect(run(failed, { type: 'BACK' })).toMatchObject({ step: 'upload', error: null });
    });

    it('stays on the error screen of a failed confirmation: "Try again" goes back', () => {
      const failed = run(loaded('Mojito'), ...toConfirm, { type: 'CONFIRM_FAILED', message: 'Boom' });

      expect(canGoBack(failed)).toBe(false);
      expect(run(failed, { type: 'BACK' })).toBe(failed);
    });

    it('has nowhere to go from the file step', () => {
      expect(canGoBack(loaded('Mojito'))).toBe(false);
    });
  });
});
