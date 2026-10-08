import type {
  Category, CategoryType, Bottle, Ingredient, Unit, Cocktail, Menu, MenuBottle, MenuSection, Shortage,
  CocktailInput, MenuInput, CocktailAvailability, SiteSettings,
  CocktailExportFormat, ImportPreviewResponse, EntityResolutionAction,
  BottleImportPayload, BottleImportPreviewResponse, BottleImportResolutions,
  BottleImportConfirmResponse,
} from '../types';

import i18n from '../i18n';

const API_BASE = '/api';
const LOGIN_URL = '/auth/login';

/** HTTP error that keeps the server message and status code. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Registers the callback run when the session is rejected (expired or invalid token). */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function buildHeaders(init: RequestInit, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    // Server error messages must follow the language chosen in the UI, not the browser's.
    'Accept-Language': i18n.resolvedLanguage ?? i18n.language ?? 'en',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function handleUnauthorized(url: string, requestToken: string | null): void {
  // A 401 on login means wrong credentials, and without a token there is no session to end.
  if (requestToken === null || url === LOGIN_URL) return;
  // A late 401 for a request sent with an older token must not end the newer session.
  if (localStorage.getItem('token') !== requestToken) return;
  localStorage.removeItem('token');
  unauthorizedHandler?.();
}

async function readErrorBody(res: Response): Promise<{ error?: unknown }> {
  return res.json().catch(() => ({}));
}

/** Sends an API request and throws an ApiError carrying the server message on failure. */
async function send(url: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: buildHeaders(init, token),
  });

  if (res.ok) return res;

  const body = await readErrorBody(res);
  if (res.status === 401) {
    handleUnauthorized(url, token);
  }
  const message = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
  throw new ApiError(res.status, message, body);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await send(url, init);
  // 204 No Content has no body to parse
  if (res.status === 204) return undefined as T;
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

// Category Types
export const categoryTypes = {
  list: () => request<CategoryType[]>('/category-types'),
  create: (data: { name: string; nameTranslations?: Record<string, string> | null; color?: string }) =>
    request<CategoryType>('/category-types', { method: 'POST', body: JSON.stringify(data) }),
  update: (name: string, data: { nameTranslations?: Record<string, string> | null; color?: string }) =>
    request<CategoryType>(`/category-types/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (name: string) =>
    request<{ message: string }>(`/category-types/${encodeURIComponent(name)}`, { method: 'DELETE' }),
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
  create: (data: Partial<Bottle> & { quantity?: number }) =>
    request<Bottle | Bottle[]>('/bottles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Bottle>) =>
    request<Bottle>(`/bottles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ message: string }>(`/bottles/${id}`, { method: 'DELETE' }),
  exportFile: async (
    format: 'json' | 'csv',
    filters?: { categoryId?: number; type?: string; search?: string; location?: string }
  ) => {
    const searchParams = new URLSearchParams({ format });
    if (filters?.categoryId) searchParams.set('categoryId', String(filters.categoryId));
    if (filters?.type) searchParams.set('type', filters.type);
    if (filters?.search) searchParams.set('search', filters.search);
    if (filters?.location) searchParams.set('location', filters.location);
    const res = await send(`/bottles/export?${searchParams.toString()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const fallback = `bottles-${new Date().toISOString().slice(0, 10)}.${format}`;
    const filename = match ? match[1] : fallback;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  importPreview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<BottleImportPreviewResponse>('/bottles/import/preview', {
      method: 'POST',
      body: formData,
    });
  },
  importConfirm: (data: { payload: BottleImportPayload; resolutions: BottleImportResolutions }) =>
    request<BottleImportConfirmResponse>('/bottles/import/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Ingredients
export const ingredients = {
  list: () => request<Ingredient[]>('/ingredients'),
  get: (id: number) => request<Ingredient>(`/ingredients/${id}`),
  create: (data: { name: string; icon?: string | null; nameTranslations?: Record<string, string> | null }) =>
    request<Ingredient>('/ingredients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; icon?: string | null; isAvailable?: boolean; nameTranslations?: Record<string, string> | null }) =>
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
  create: (data: { name: string; abbreviation: string; conversionFactorToMl?: number | null; nameTranslations?: Record<string, string> | null }) =>
    request<Unit>('/units', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Unit>) =>
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
  listUnits: () => request<Unit[]>('/public/units'),
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

// Backup
export const backup = {
  exportBackup: async () => {
    const res = await send('/backup/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1] : `backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  importBackup: (file: File) => {
    const formData = new FormData();
    formData.append('backup', file);
    return request<{ success: boolean; message: string }>('/backup/import', {
      method: 'POST',
      body: formData,
    });
  },
};
