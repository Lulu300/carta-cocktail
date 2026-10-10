/**
 * The only source of query keys: pages and hooks never write a key array inline,
 * so a mutation can invalidate exactly what a page reads.
 */
export const qk = {
  shortages: ['shortages'] as const,
  categories: ['categories'] as const,
  categoryTypes: ['categoryTypes'] as const,
  bottles: ['bottles'] as const,
  ingredients: ['ingredients'] as const,
  units: ['units'] as const,
  cocktails: ['cocktails'] as const,
  cocktail: (id: number) => ['cocktails', id] as const,
  availability: ['availability'] as const,
  menus: ['menus'] as const,
  menu: (id: number) => ['menus', id] as const,
};
