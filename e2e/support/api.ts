import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';

/** Session of the admin, written once by `auth.setup.ts` and loaded by the admin journeys. */
export const ADMIN_STATE_FILE = '.auth/admin.json';

interface StoredState {
  origins: { localStorage: { name: string; value: string }[] }[];
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@carta.local';

/**
 * Signs in through the API and stores the token where the journeys load their session from.
 * A restored backup ends every session: the journey that restores one calls this again.
 */
export async function signInAsAdmin(request: APIRequestContext): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  expect(password, 'ADMIN_PASSWORD must be set (the password the backend received)').toBeTruthy();
  const response = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password },
  });
  expect(response.ok(), `login: ${response.status()}`).toBe(true);
  const { token } = (await response.json()) as { token: string };

  const origin = new URL(response.url()).origin;
  const state = {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: 'token', value: token }] }],
  };
  mkdirSync(dirname(ADMIN_STATE_FILE), { recursive: true });
  writeFileSync(ADMIN_STATE_FILE, JSON.stringify(state));
}

export function adminToken(): string {
  const state = JSON.parse(readFileSync(ADMIN_STATE_FILE, 'utf8')) as StoredState;
  const token = state.origins[0]?.localStorage.find((item) => item.name === 'token');
  if (!token) throw new Error(`No token in ${ADMIN_STATE_FILE}: did the setup project run?`);
  return token.value;
}

/** A name no other test uses, so that journeys never depend on the state of the database. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Lower-case, dash-separated: a valid menu slug. */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

interface Entity {
  id: number;
}

/**
 * The admin API, to prepare the data of a journey. The journey itself clicks through the
 * interface only for what it is about: everything else is created here, much faster.
 */
export class AdminApi {
  constructor(private readonly request: APIRequestContext) {}

  private async send<T>(method: 'get' | 'post' | 'put', path: string, data?: unknown): Promise<T> {
    const response = await this.request[method](path, {
      headers: { Authorization: `Bearer ${adminToken()}` },
      data,
    });
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  }

  createCategory(name: string, type = 'SPIRIT'): Promise<Entity> {
    return this.send('post', '/api/categories', { name, type });
  }

  createBottle(
    name: string,
    categoryId: number,
    flags: { isApero?: boolean; isDigestif?: boolean } = {},
  ): Promise<Entity> {
    return this.send('post', '/api/bottles', {
      name,
      categoryId,
      capacityMl: 700,
      remainingPercent: 100,
      ...flags,
    });
  }

  createCocktail(name: string): Promise<Entity> {
    return this.send('post', '/api/cocktails', { name });
  }

  async listCocktailNames(): Promise<string[]> {
    const cocktails = await this.send<{ name: string }[]>('get', '/api/cocktails');
    return cocktails.map((cocktail) => cocktail.name);
  }

  /** A public menu holding the cocktails, in a section when a name is given. */
  async createPublicMenu(name: string, cocktailIds: number[], sectionName?: string) {
    const slug = toSlug(name);
    const menu = await this.send<Entity>('post', '/api/menus', { name, slug, isPublic: true });
    const section = sectionName
      ? await this.send<Entity>('post', `/api/menu-sections/menu/${menu.id}/sections`, {
          name: sectionName,
        })
      : undefined;
    await this.send('put', `/api/menus/${menu.id}`, {
      cocktails: cocktailIds.map((cocktailId) => ({ cocktailId, menuSectionId: section?.id })),
    });
    return { ...menu, slug };
  }
}
