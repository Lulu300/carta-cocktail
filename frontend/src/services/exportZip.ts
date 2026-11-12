import { cocktails as cocktailsApi, type CocktailExportFile } from './api';

/**
 * Most cocktails the backend exports in one request (MAX_EXPORT_BATCH in
 * backend/src/validation/cocktails.ts). One request per cocktail would reach the
 * API rate limit when the admin exports a few hundred of them.
 */
export const EXPORT_BATCH_SIZE = 500;

/** The exports of every cocktail of `ids`, in their order, one batch after the other. */
async function fetchExports(ids: number[]): Promise<CocktailExportFile[]> {
  const files: CocktailExportFile[] = [];
  for (let start = 0; start < ids.length; start += EXPORT_BATCH_SIZE) {
    files.push(...(await cocktailsApi.exportRecipes(ids.slice(start, start + EXPORT_BATCH_SIZE))));
  }
  return files;
}

/**
 * Cocktail names are not unique, so two exports can get the same server file name,
 * and JSZip replaces an entry of the same name. Adds -2, -3… until the name is free.
 */
function uniqueFilename(filename: string, taken: Set<string>): string {
  const base = filename.replace(/\.json$/, '');
  let candidate = filename;
  for (let suffix = 2; taken.has(candidate); suffix++) {
    candidate = `${base}-${suffix}.json`;
  }
  taken.add(candidate);
  return candidate;
}

export async function exportCocktailsAsZip(ids: number[]): Promise<void> {
  // Loaded on demand: only batch exports need it
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const exports = await fetchExports(ids);

  const taken = new Set<string>();
  for (const { filename, data } of exports) {
    zip.file(uniqueFilename(filename, taken), JSON.stringify(data, null, 2));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cocktails-export-${date}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
