import type {
  Category,
  CategoryType,
  Bottle,
  Ingredient,
  Unit,
  Cocktail,
  Menu,
  MenuBottle,
  MenuSection,
  Shortage,
  CocktailInput,
  MenuInput,
  CocktailAvailability,
  SiteSettings,
  CocktailExportFormat,
  ImportPreviewResponse,
  EntityResolutionAction,
  BottleImportPayload,
  BottleImportPreviewResponse,
  BottleImportResolutions,
  BottleImportConfirmResponse,
  DeleteOptions,
  DeletionResponse,
} from '../types';

import i18n from '../i18n';
import { FALLBACK_LANGUAGE } from '../utils/localization';
import { downloadBlob } from '../utils/downloadBlob';

const API_BASE = '/api';
const LOGIN_URL = '/auth/login';

/** A rule an input broke, from the `details` of a validation 400: `path` is `body.ingredients.1.quantity`. */
export interface ValidationIssue {
  path: string;
  code: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  const issue = value as Partial<ValidationIssue> | null;
  return typeof issue?.path === 'string' && typeof issue.code === 'string';
}

/**
 * A recipe line the import cannot write, from the `details` of an `importUnresolved` 400: `line`
 * is its index in the recipe (0 for the first), `kind` what is missing (`unit`, `category`,
 * `bottle`, `ingredient`), `name` the unit abbreviation or the source name of the file, null
 * for a line without unit.
 */
export interface UnresolvedReference {
  line: number;
  kind: string;
  name: string | null;
}

/**
 * A recipe line naming a row that no longer exists, from the `details` of an `unknownReference`
 * 400: `line` is its index in the request, `field` the key naming it (`unitId`, `bottleId`…).
 */
export interface UnknownReference {
  line: number;
  field: string;
  id: number;
}

function isLineIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isUnresolvedReference(value: unknown): value is UnresolvedReference {
  const reference = value as Partial<UnresolvedReference> | null;
  return (
    isLineIndex(reference?.line) &&
    typeof reference.kind === 'string' &&
    (typeof reference.name === 'string' || reference.name === null)
  );
}

function isUnknownReference(value: unknown): value is UnknownReference {
  const reference = value as Partial<UnknownReference> | null;
  return (
    isLineIndex(reference?.line) &&
    typeof reference.field === 'string' &&
    typeof reference.id === 'number'
  );
}

/** HTTP error that keeps the server message and status code. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  /** Seconds the server asks to wait before trying again (Retry-After of a 429). */
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, body?: unknown, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /**
   * The issues of a 400 refused by the backend's validation, empty for any other error.
   * Other 400s send `details` of another shape (unresolved or unknown references): their
   * entries are left out, `body` keeps them as sent.
   */
  validationIssues(): ValidationIssue[] {
    return this.badRequestDetails()
      .filter(isValidationIssue)
      .map(({ path, code }) => ({ path, code }));
  }

  /** The lines of an import confirmation refused with `importUnresolved`, empty for any other error. */
  unresolvedReferences(): UnresolvedReference[] {
    return this.badRequestDetails()
      .filter(isUnresolvedReference)
      .map(({ line, kind, name }) => ({ line, kind, name }));
  }

  /** The lines of a recipe refused with `unknownReference`, empty for any other error. */
  unknownReferences(): UnknownReference[] {
    return this.badRequestDetails()
      .filter(isUnknownReference)
      .map(({ line, field, id }) => ({ line, field, id }));
  }

  // Each 400 sends its own shape of details: the callers keep the entries of the shape they read.
  private badRequestDetails(): unknown[] {
    if (this.status !== 400) return [];
    const details = (this.body as { details?: unknown } | undefined)?.details;
    return Array.isArray(details) ? details : [];
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
    // Server error messages and the import's dates must follow the language chosen in the UI, not
    // the browser's. The chosen code, not resolvedLanguage: English (UK) resolves to the `en`
    // messages, but the import reads its dates day first.
    'Accept-Language': i18n.language || FALLBACK_LANGUAGE,
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

/**
 * Retry-After of a rate-limited answer, in seconds. The backend's limiter sends a
 * number of seconds, never the HTTP-date form.
 */
function readRetryAfter(res: Response): number | undefined {
  if (res.status !== 429) return undefined;
  const header = res.headers.get('Retry-After')?.trim() ?? '';
  return /^\d+$/.test(header) ? Number(header) : undefined;
}

/**
 * Message of a failed answer. The backend always sends an `error` it has translated: keep it.
 * Without one, something in front of the backend answered: nginx sends an HTML page with a 502
 * while the backend is stopped or starting and a 504 when it does not answer in time, and Vite's
 * dev proxy an empty 502. "HTTP 502" would tell the admin nothing; the status stays in ApiError.
 * A 4xx without one was refused before reaching the routes: mostly nginx's 413 for a body over
 * client_max_body_size, whose limit depends on the route, so the message gives no size. Otherwise
 * nginx's 400 or 414 (headers or URL too long), Node's 408 or 431, or a proxy's own page: the
 * message keeps the status, the only detail the admin can report.
 */
function errorMessage(status: number, body: { error?: unknown }): string {
  if (typeof body.error === 'string') return body.error;
  if (status >= 500) return i18n.t('common.serverUnavailable');
  if (status === 413) return i18n.t('common.requestTooLarge');
  return i18n.t('common.requestFailed', { status });
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
  // A request abandoned while its error body was read is not a rejected session, and not an error to show.
  if (init.signal?.aborted) throw init.signal.reason;
  if (res.status === 401) {
    handleUnauthorized(url, token);
  }
  throw new ApiError(res.status, errorMessage(res.status, body), body, readRetryAfter(res));
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await send(url, init);
  // 204 No Content has no body to parse
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** File name suggested by the Content-Disposition header, or `fallback` when the server sends none. */
function attachmentFilename(res: Response, fallback: string): string {
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}

/** A cocktail export with the file name chosen by the server. */
export interface CocktailExportFile {
  filename: string;
  data: CocktailExportFormat;
}

/**
 * The backend names the file (accents removed, `cocktail-<id>.json` when the name has
 * no latin letter): the fallback only covers a response without the header.
 */
async function requestCocktailExport(url: string, id: number): Promise<CocktailExportFile> {
  const res = await send(url);
  return { filename: attachmentFilename(res, `cocktail-${id}.json`), data: await res.json() };
}

/** URL of a DELETE that may be forced: `?force=true` also deletes what uses the item. */
function deletionUrl(path: string, { force = false }: DeleteOptions): string {
  return force ? `${path}?force=true` : path;
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: number; email: string }>('/auth/me'),
  /** Revokes every token of the admin, the one sending this request included. */
  logoutAll: () => request<{ message: string }>('/auth/logout-all', { method: 'POST' }),
};

/**
 * Category type names a path segment cannot carry: the empty name, which data older than
 * v1.9.0 can hold, cannot be addressed, and the browser resolves `.` and `..` away.
 */
const NAMES_OUTSIDE_THE_PATH = new Set(['', '.', '..']);

/** URL of one category type: its name is a path segment, or the `name` query when it cannot be one. */
function categoryTypeUrl(name: string): string {
  return NAMES_OUTSIDE_THE_PATH.has(name)
    ? `/category-types?name=${encodeURIComponent(name)}`
    : `/category-types/${encodeURIComponent(name)}`;
}

// Category Types
export const categoryTypes = {
  list: (signal?: AbortSignal) => request<CategoryType[]>('/category-types', { signal }),
  create: (data: {
    name: string;
    nameTranslations?: Record<string, string> | null;
    color?: string;
  }) => request<CategoryType>('/category-types', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    name: string,
    data: { nameTranslations?: Record<string, string> | null; color?: string },
  ) => request<CategoryType>(categoryTypeUrl(name), { method: 'PUT', body: JSON.stringify(data) }),
  delete: (name: string) =>
    request<{ message: string }>(categoryTypeUrl(name), { method: 'DELETE' }),
};

// Categories
export const categories = {
  list: (signal?: AbortSignal) => request<Category[]>('/categories', { signal }),
  create: (data: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number, options: DeleteOptions = {}) =>
    request<DeletionResponse>(deletionUrl(`/categories/${id}`, options), { method: 'DELETE' }),
};

// Bottles
export const bottles = {
  list: (params?: { categoryId?: number; type?: string }, signal?: AbortSignal) => {
    const searchParams = new URLSearchParams();
    if (params?.categoryId) searchParams.set('categoryId', String(params.categoryId));
    if (params?.type) searchParams.set('type', params.type);
    const query = searchParams.toString();
    return request<Bottle[]>(`/bottles${query ? `?${query}` : ''}`, { signal });
  },
  create: (data: Partial<Bottle> & { quantity?: number }) =>
    request<Bottle | Bottle[]>('/bottles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Bottle>) =>
    request<Bottle>(`/bottles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number, options: DeleteOptions = {}) =>
    request<DeletionResponse>(deletionUrl(`/bottles/${id}`, options), { method: 'DELETE' }),
  exportFile: async (
    format: 'json' | 'csv',
    filters?: { categoryId?: number; type?: string; search?: string; location?: string },
  ) => {
    const searchParams = new URLSearchParams({ format });
    if (filters?.categoryId) searchParams.set('categoryId', String(filters.categoryId));
    if (filters?.type) searchParams.set('type', filters.type);
    if (filters?.search) searchParams.set('search', filters.search);
    if (filters?.location) searchParams.set('location', filters.location);
    const res = await send(`/bottles/export?${searchParams.toString()}`);
    const blob = await res.blob();
    downloadBlob(
      blob,
      attachmentFilename(res, `bottles-${new Date().toISOString().slice(0, 10)}.${format}`),
    );
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
  list: (signal?: AbortSignal) => request<Ingredient[]>('/ingredients', { signal }),
  create: (data: {
    name: string;
    icon?: string | null;
    nameTranslations?: Record<string, string> | null;
  }) => request<Ingredient>('/ingredients', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: number,
    data: {
      name?: string;
      icon?: string | null;
      isAvailable?: boolean;
      nameTranslations?: Record<string, string> | null;
    },
  ) => request<Ingredient>(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number, options: DeleteOptions = {}) =>
    request<DeletionResponse>(deletionUrl(`/ingredients/${id}`, options), { method: 'DELETE' }),
  bulkAvailability: (data: { available: boolean }) =>
    request<{ message: string; updated: number }>('/ingredients/bulk-availability', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Units
export const units = {
  list: (signal?: AbortSignal) => request<Unit[]>('/units', { signal }),
  create: (data: {
    name: string;
    abbreviation: string;
    conversionFactorToMl?: number | null;
    nameTranslations?: Record<string, string> | null;
  }) => request<Unit>('/units', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Unit>) =>
    request<Unit>(`/units/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/units/${id}`, { method: 'DELETE' }),
};

// Cocktails
export const cocktails = {
  list: (signal?: AbortSignal) => request<Cocktail[]>('/cocktails', { signal }),
  get: (id: number, signal?: AbortSignal) => request<Cocktail>(`/cocktails/${id}`, { signal }),
  create: (data: CocktailInput) =>
    request<Cocktail>('/cocktails', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: CocktailInput) =>
    request<Cocktail>(`/cocktails/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/cocktails/${id}`, { method: 'DELETE' }),
  uploadImage: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return request<Cocktail>(`/cocktails/${id}/image`, {
      method: 'POST',
      body: formData,
    });
  },
  exportRecipe: (id: number) => requestCocktailExport(`/cocktails/${id}/export`, id),
  /** The exports of several cocktails in one request, in the order of `ids` (at most EXPORT_BATCH_SIZE of them). */
  exportRecipes: (ids: number[]) =>
    request<CocktailExportFile[]>('/cocktails/export', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  importPreview: (data: CocktailExportFormat) =>
    request<ImportPreviewResponse>('/cocktails/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importConfirm: (data: {
    recipe: CocktailExportFormat;
    resolutions: Record<string, Record<string, EntityResolutionAction>>;
  }) =>
    request<Cocktail>('/cocktails/import/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Menus
export const menus = {
  list: (signal?: AbortSignal) => request<Menu[]>('/menus', { signal }),
  get: (id: number, signal?: AbortSignal) => request<Menu>(`/menus/${id}`, { signal }),
  create: (data: MenuInput) =>
    request<Menu>('/menus', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<MenuInput>) =>
    request<Menu>(`/menus/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/menus/${id}`, { method: 'DELETE' }),
};

/** A bottle removed from a system menu: the sync never adds it back. */
export interface MenuBottleExclusion {
  menuId: number;
  bottleId: number;
  bottle: Bottle;
  createdAt: string;
}

// Menu Bottles
export const menuBottles = {
  update: (
    id: number,
    data: { position?: number; isHidden?: boolean; menuSectionId?: number | null },
  ) => request<MenuBottle>(`/menu-bottles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** Applies the same change to these entries (`MenuBottle.id`) of the menu, all of them or none. */
  updateEntries: (
    menuId: number,
    ids: number[],
    changes: { isHidden?: boolean; menuSectionId?: number | null },
  ) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/entries`, {
      method: 'PUT',
      body: JSON.stringify({ ids, ...changes }),
    }),
  /** Adds these bottles at the end of a personal menu, in this order, all of them or none. */
  addBottles: (menuId: number, bottleIds: number[]) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ bottleIds }),
    }),
  /** Removes these entries (`MenuBottle.id`) of the menu, all of them or none; a system menu keeps them as exclusions. */
  removeEntries: (menuId: number, ids: number[]) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/entries/remove`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  sync: (menuId: number) =>
    request<{ message: string; added: number; removed: number }>(
      `/menu-bottles/menu/${menuId}/sync`,
      { method: 'POST' },
    ),
  /** `ids` lists every entry (`MenuBottle.id`) of the menu, in the new order: one transaction. */
  reorder: (menuId: number, ids: number[]) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  exclusions: (menuId: number) =>
    request<MenuBottleExclusion[]>(`/menu-bottles/menu/${menuId}/exclusions`),
  /** Removes these bottles from a system menu, all of them or none. */
  exclude: (menuId: number, bottleIds: number[]) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/exclusions`, {
      method: 'POST',
      body: JSON.stringify({ bottleIds }),
    }),
  /** Puts these excluded bottles back at the end of the menu, all of them or none. */
  restore: (menuId: number, bottleIds: number[]) =>
    request<{ message: string }>(`/menu-bottles/menu/${menuId}/exclusions/restore`, {
      method: 'POST',
      body: JSON.stringify({ bottleIds }),
    }),
};

// Menu Sections
export const menuSections = {
  create: (menuId: number, data: { name: string }) =>
    request<MenuSection>(`/menu-sections/menu/${menuId}/sections`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: { name?: string; position?: number }) =>
    request<MenuSection>(`/menu-sections/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
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
  listMenus: (signal?: AbortSignal) => request<Menu[]>('/public/menus', { signal }),
  getMenu: (slug: string, signal?: AbortSignal) =>
    request<Menu>(`/public/menus/${slug}`, { signal }),
  getCocktail: (id: number, signal?: AbortSignal) =>
    request<Cocktail>(`/public/cocktails/${id}`, { signal }),
  exportCocktail: (id: number) => requestCocktailExport(`/public/cocktails/${id}/export`, id),
  getSettings: () => request<SiteSettings>('/public/settings'),
  listUnits: () => request<Unit[]>('/public/units'),
};

// Shortages
export const shortages = {
  list: (signal?: AbortSignal) => request<Shortage[]>('/shortages', { signal }),
};

// Availability
export const availability = {
  getAllCocktails: (signal?: AbortSignal) =>
    request<Record<number, CocktailAvailability>>('/availability/cocktails', { signal }),
};

// Settings (admin)
export const settings = {
  get: () => request<SiteSettings>('/settings'),
  update: (data: { siteName: string; siteIcon: string }) =>
    request<SiteSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  updateProfile: (data: { email?: string; currentPassword?: string; newPassword?: string }) =>
    // `token` comes back when the password changed: the server revoked the previous one
    request<{ id: number; email: string; token?: string }>('/settings/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// System (admin)
export interface RequiredAction {
  version: string;
  /** Before or after the upgrade, as the release notes say: "before" ones can only be checked now. */
  when: 'before' | 'after';
  /** Text of the release notes, in English. */
  action: string;
}

/** Required actions of the versions between `from` and `to`, until the admin confirms them. */
export interface UpgradeNotice {
  from: string;
  to: string;
  actions: RequiredAction[];
}

export const system = {
  /** null when there is no notice to show (204). */
  getUpgradeNotice: async (signal?: AbortSignal) =>
    (await request<UpgradeNotice | undefined>('/system/upgrade-notice', { signal })) ?? null,
  acknowledgeUpgradeNotice: () =>
    request<void>('/system/upgrade-notice/acknowledge', { method: 'POST' }),
};

// Backup
export interface BackupRestoreResult {
  message: string;
  /** Files of uploads/ that were not restored: not an image, or a file name already restored. */
  skippedFiles: number;
  /** The backup has an older database schema: the backend applies the missing migrations when it restarts. */
  restartRecommended: boolean;
}

export const backup = {
  exportBackup: async () => {
    const res = await send('/backup/export');
    const blob = await res.blob();
    downloadBlob(
      blob,
      attachmentFilename(res, `backup-${new Date().toISOString().slice(0, 10)}.zip`),
    );
  },
  importBackup: (file: File) => {
    const formData = new FormData();
    formData.append('backup', file);
    return request<BackupRestoreResult>('/backup/import', {
      method: 'POST',
      body: formData,
    });
  },
};
