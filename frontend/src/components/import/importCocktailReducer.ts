import type { CocktailExportFormat, ImportPreviewResponse } from '../../types';
import {
  buildAutoResolutions,
  emptyResolutions,
  type ImportResolutions,
} from './importResolutions';

/** `previewing`: the preview of the current recipe is requested; the wizard sends it. */
export type CocktailImportStep =
  'upload' | 'previewing' | 'resolve' | 'confirm' | 'success' | 'error' | 'batchSummary';

export interface ImportResult {
  name: string;
  success: boolean;
  id?: number;
}

export interface CocktailImportState {
  step: CocktailImportStep;
  recipes: CocktailExportFormat[];
  currentIndex: number;
  preview: ImportPreviewResponse | null;
  resolutions: ImportResolutions;
  /** By recipe index: retrying a recipe replaces its result instead of adding one. */
  results: Record<number, ImportResult>;
  error: string | null;
  /** What the refusal behind `error` names, one sentence each (the recipe rows it could not write). */
  errorDetails: string[];
  /** The request behind the `error` step, which decides what "Try again" does. */
  failedRequest: 'preview' | 'confirm' | null;
}

/** A failed request: the backend's message and the details it names, already translated. */
export interface ImportRefusal {
  message: string;
  details?: string[];
}

export type CocktailImportAction =
  | { type: 'LOADED'; recipes: CocktailExportFormat[] }
  | { type: 'PREVIEW_REQUESTED' }
  | { type: 'PREVIEW_OK'; preview: ImportPreviewResponse }
  | ({ type: 'PREVIEW_FAILED' } & ImportRefusal)
  | { type: 'RESOLUTIONS_CHANGED'; resolutions: ImportResolutions }
  | { type: 'NEXT' }
  | { type: 'CONFIRM_OK'; cocktail: { id: number; name: string } }
  | ({ type: 'CONFIRM_FAILED' } & ImportRefusal)
  | { type: 'RETRY' }
  | { type: 'SKIP' }
  | { type: 'BACK' };

const NO_ERROR = {
  error: null,
  errorDetails: [],
  failedRequest: null,
} satisfies Partial<CocktailImportState>;

export const initialCocktailImportState: CocktailImportState = {
  step: 'upload',
  recipes: [],
  currentIndex: 0,
  preview: null,
  resolutions: emptyResolutions(),
  results: {},
  ...NO_ERROR,
};

export function isBatch(state: CocktailImportState): boolean {
  return state.recipes.length > 1;
}

export function currentRecipe(state: CocktailImportState): CocktailExportFormat | undefined {
  return state.recipes[state.currentIndex];
}

export function hasNextRecipe(state: CocktailImportState): boolean {
  return state.currentIndex < state.recipes.length - 1;
}

/**
 * Where "Back" leads, or null when the button is hidden. Only the first recipe
 * goes back to the file: the next ones are already part of the batch.
 */
function previousStep(state: CocktailImportState): CocktailImportStep | null {
  if (state.step === 'confirm') return 'resolve';
  if (state.currentIndex > 0) return null;
  if (state.step === 'resolve') return 'upload';
  if (state.step === 'error' && state.failedRequest === 'preview') return 'upload';
  return null;
}

export function canGoBack(state: CocktailImportState): boolean {
  return previousStep(state) !== null;
}

function failure({
  message,
  details = [],
}: ImportRefusal): Pick<CocktailImportState, 'error' | 'errorDetails'> {
  return { error: message, errorDetails: details };
}

function withResult(
  state: CocktailImportState,
  result: ImportResult,
): Record<number, ImportResult> {
  return { ...state.results, [state.currentIndex]: result };
}

function failedResult(state: CocktailImportState): ImportResult {
  return { name: currentRecipe(state)?.cocktail.name ?? '', success: false };
}

/** Moves to the next recipe of the batch, or to the summary after the last one. */
function advance(
  state: CocktailImportState,
  results: Record<number, ImportResult>,
): CocktailImportState {
  if (!hasNextRecipe(state)) return { ...state, results, step: 'batchSummary', ...NO_ERROR };
  return {
    ...state,
    results,
    step: 'previewing',
    currentIndex: state.currentIndex + 1,
    preview: null,
    resolutions: emptyResolutions(),
    ...NO_ERROR,
  };
}

export function importCocktailReducer(
  state: CocktailImportState,
  action: CocktailImportAction,
): CocktailImportState {
  switch (action.type) {
    case 'LOADED':
      return { ...initialCocktailImportState, recipes: action.recipes };
    case 'PREVIEW_REQUESTED':
      return { ...state, step: 'previewing', ...NO_ERROR };
    case 'PREVIEW_OK':
      return {
        ...state,
        step: 'resolve',
        preview: action.preview,
        resolutions: buildAutoResolutions(action.preview),
      };
    case 'PREVIEW_FAILED':
      return {
        ...state,
        step: 'error',
        preview: null,
        ...failure(action),
        failedRequest: 'preview',
      };
    case 'RESOLUTIONS_CHANGED':
      return { ...state, resolutions: action.resolutions };
    case 'NEXT':
      return state.step === 'resolve' ? { ...state, step: 'confirm' } : state;
    case 'CONFIRM_OK': {
      const results = withResult(state, {
        name: action.cocktail.name,
        success: true,
        id: action.cocktail.id,
      });
      return isBatch(state) ? advance(state, results) : { ...state, results, step: 'success' };
    }
    case 'CONFIRM_FAILED':
      return {
        ...state,
        step: 'error',
        ...failure(action),
        failedRequest: 'confirm',
        results: withResult(state, failedResult(state)),
      };
    case 'RETRY':
      if (state.step !== 'error') return state;
      // A failed confirmation keeps the preview and the admin's choices
      return {
        ...state,
        step: state.failedRequest === 'confirm' ? 'resolve' : 'previewing',
        ...NO_ERROR,
      };
    case 'SKIP':
      return advance(state, withResult(state, failedResult(state)));
    case 'BACK': {
      const step = previousStep(state);
      return step ? { ...state, step, ...NO_ERROR } : state;
    }
  }
}
