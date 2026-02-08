import JSZip from 'jszip';
import { cocktails as cocktailsApi } from './api';
import type { Cocktail } from '../types';

export async function exportCocktailsAsZip(
  ids: number[],
  cocktailList: Cocktail[],
): Promise<void> {
  const zip = new JSZip();

  const exports = await Promise.all(
    ids.map(async (id) => {
      const data = await cocktailsApi.exportRecipe(id);
      const cocktail = cocktailList.find((c) => c.id === id);
      const name = cocktail?.name || data.cocktail.name;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return { slug, data };
    }),
  );

  for (const { slug, data } of exports) {
    zip.file(`cocktail-${slug}.json`, JSON.stringify(data, null, 2));
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
