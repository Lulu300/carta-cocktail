import { cocktails as cocktailsApi } from './api';

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

  const exports = await Promise.all(ids.map((id) => cocktailsApi.exportRecipe(id)));

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
