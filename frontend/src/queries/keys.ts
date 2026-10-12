/**
 * Who reads a public page: the server adds private fields (notes, preferred
 * bottles) for a signed-in admin, so each viewer gets its own cache entry.
 */
export type PublicViewer = 'admin' | 'guest';

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
  // Under qk.menu(id): refreshing a menu also refreshes the bottles removed from it.
  menuExclusions: (id: number) => ['menus', id, 'exclusions'] as const,
  publicMenus: ['public', 'menus'] as const,
  publicMenu: (slug: string, viewer: PublicViewer) => ['public', 'menu', slug, viewer] as const,
  publicCocktail: (id: number, viewer: PublicViewer) => ['public', 'cocktail', id, viewer] as const,
};
