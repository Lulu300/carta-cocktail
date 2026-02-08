import type {
  Category, Bottle, Ingredient, Unit, Cocktail, Menu, MenuBottle, MenuSection, Shortage,
  CocktailInput, MenuInput, CocktailAvailability, SiteSettings,
  CocktailExportFormat, ImportPreviewResponse, EntityResolutionAction,
} from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: number; email: string }>('/auth/me'),
};

// Categories
export const categories = {
  list: () => request<Category[]>('/categories'),
  get: (id: number) => request<Category>(`/categories/${id}`),
  create: (data: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),
};

// Bottles
export const bottles = {
  list: (params?: { categoryId?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.categoryId) searchParams.set('categoryId', String(params.categoryId));
    if (params?.type) searchParams.set('type', params.type);
    const query = searchParams.toString();
    return request<Bottle[]>(`/bottles${query ? `?${query}` : ''}`);
  },
  get: (id: number) => request<Bottle>(`/bottles/${id}`),
  create: (data: Partial<Bottle>) =>
    request<Bottle>('/bottles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Bottle>) =>
    request<Bottle>(`/bottles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/bottles/${id}`, { method: 'DELETE' }),
};

// Ingredients
export const ingredients = {
  list: () => request<Ingredient[]>('/ingredients'),
  get: (id: number) => request<Ingredient>(`/ingredients/${id}`),
  create: (data: { name: string; icon?: string | null }) =>
    request<Ingredient>('/ingredients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; icon?: string | null; isAvailable?: boolean }) =>
    request<Ingredient>(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/ingredients/${id}`, { method: 'DELETE' }),
  bulkAvailability: (data: { available: boolean }) =>
    request<{ updated: number }>('/ingredients/bulk-availability', { method: 'POST', body: JSON.stringify(data) }),
};

// Units
export const units = {
  list: () => request<Unit[]>('/units'),
  get: (id: number) => request<Unit>(`/units/${id}`),
  create: (data: { name: string; abbreviation: string }) =>
    request<Unit>('/units', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name: string; abbreviation: string }) =>
    request<Unit>(`/units/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/units/${id}`, { method: 'DELETE' }),
};

// Cocktails
export const cocktails = {
  list: () => request<Cocktail[]>('/cocktails'),
  get: (id: number) => request<Cocktail>(`/cocktails/${id}`),
  create: (data: CocktailInput) =>
    request<Cocktail>('/cocktails', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: CocktailInput) =>
    request<Cocktail>(`/cocktails/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/cocktails/${id}`, { method: 'DELETE' }),
  uploadImage: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return request<Cocktail>(`/cocktails/${id}/image`, {
      method: 'POST',
      body: formData,
    });
  },
  exportRecipe: (id: number) =>
    request<CocktailExportFormat>(`/cocktails/${id}/export`),
  importPreview: (data: CocktailExportFormat) =>
    request<ImportPreviewResponse>('/cocktails/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importConfirm: (data: { recipe: CocktailExportFormat; resolutions: Record<string, Record<string, EntityResolutionAction>> }) =>
    request<Cocktail>('/cocktails/import/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Menus
export const menus = {
  list: () => request<Menu[]>('/menus'),
  get: (id: number) => request<Menu>(`/menus/${id}`),
  create: (data: MenuInput) =>
    request<Menu>('/menus', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<MenuInput>) =>
    request<Menu>(`/menus/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/menus/${id}`, { method: 'DELETE' }),
};

// Menu Bottles
export const menuBottles = {
  listByMenu: (menuId: number) => request<MenuBottle[]>(`/menu-bottles/menu/${menuId}`),
  create: (data: { menuId: number; bottleId: number; position?: number; isHidden?: boolean }) =>
    request<MenuBottle>('/menu-bottles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { position?: number; isHidden?: boolean; menuSectionId?: number | null }) =>
    request<MenuBottle>(`/menu-bottles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/menu-bottles/${id}`, { method: 'DELETE' }),
  sync: (menuId: number) =>
    request<{ message: string; added: number; removed: number }>(`/menu-bottles/menu/${menuId}/sync`, { method: 'POST' }),
};

// Menu Sections
export const menuSections = {
  listByMenu: (menuId: number) => request<MenuSection[]>(`/menu-sections/menu/${menuId}/sections`),
  create: (menuId: number, data: { name: string }) =>
    request<MenuSection>(`/menu-sections/menu/${menuId}/sections`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; position?: number }) =>
    request<MenuSection>(`/menu-sections/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/menu-sections/sections/${id}`, { method: 'DELETE' }),
  reorder: (menuId: number, sectionIds: number[]) =>
    request<{ message: string }>(`/menu-sections/menu/${menuId}/sections/reorder`, {
      method: 'POST',
      body: JSON.stringify({ sectionIds }),
    }),
};

// Public
export const publicApi = {
  listMenus: () => request<Menu[]>('/public/menus'),
  getMenu: (slug: string) => request<Menu>(`/public/menus/${slug}`),
  getCocktail: (id: number) => request<Cocktail>(`/public/cocktails/${id}`),
  exportCocktail: (id: number) =>
    request<CocktailExportFormat>(`/public/cocktails/${id}/export`),
  getSettings: () => request<SiteSettings>('/public/settings'),
};

// Shortages
export const shortages = {
  list: () => request<Shortage[]>('/shortages'),
};

// Availability
export const availability = {
  getCocktail: (id: number) => request<CocktailAvailability>(`/availability/cocktails/${id}`),
  getAllCocktails: () => request<Record<number, CocktailAvailability>>('/availability/cocktails'),
};

// Settings (admin)
export const settings = {
  get: () => request<SiteSettings>('/settings'),
  update: (data: { siteName: string; siteIcon: string }) =>
    request<SiteSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  updateProfile: (data: { email?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ id: number; email: string }>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) }),
};
