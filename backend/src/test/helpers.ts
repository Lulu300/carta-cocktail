import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import { Prisma } from '../generated/prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';

// Tests and routes share the server's client, as in production
export { prisma };
export const request = supertest(app);

/**
 * Connect to the test database, which globalSetup.ts creates once per run.
 * Call in beforeAll().
 */
export async function setupTestDatabase(): Promise<void> {
  await prisma.$connect();
}

/**
 * Disconnect Prisma; globalSetup.ts deletes the database at the end of the run.
 * Call in afterAll().
 */
export async function teardownTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Tables of every model of schema.prisma, so that a model added later is emptied too.
 * No model renames its table (@@map): each table has the name of its model.
 */
export function schemaTables(): string[] {
  return Object.values(Prisma.ModelName);
}

/**
 * Delete all data from every table of the schema.
 * Call in beforeEach().
 */
export async function cleanDatabase(): Promise<void> {
  // PRAGMA foreign_keys = OFF has no effect inside a transaction. Deferring the
  // checks to the commit works in any table order: no row is left by then.
  await prisma.$transaction([
    prisma.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON'),
    ...schemaTables().map((table) => prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)),
  ]);
}

let adminPasswordHash: Promise<string> | undefined;

/**
 * Hash of the admin test password, computed once per test file: a bcrypt hash
 * takes about 50 ms, which added up to most of the run time when every test
 * hashed it again.
 */
function getAdminPasswordHash(): Promise<string> {
  adminPasswordHash ??= bcrypt.hash('testpass123', 10);
  return adminPasswordHash;
}

/**
 * Seed the minimum required data after cleanDatabase.
 * Call in beforeEach() after cleanDatabase().
 */
export async function seedRequiredData(): Promise<void> {
  // Create admin user
  const hash = await getAdminPasswordHash();
  await prisma.user.create({
    data: { id: 1, email: 'admin@test.local', passwordHash: hash },
  });

  // Create default category types
  await prisma.categoryType.createMany({
    data: [
      { name: 'SPIRIT', color: 'blue' },
      { name: 'SYRUP', color: 'purple' },
      { name: 'SOFT', color: 'green' },
    ],
  });

  // Create default menus (aperitifs and digestifs)
  await prisma.menu.createMany({
    data: [
      { name: 'Apéritifs', slug: 'aperitifs', type: 'APEROS', isPublic: false },
      { name: 'Digestifs', slug: 'digestifs', type: 'DIGESTIFS', isPublic: false },
    ],
  });

  // Create default site settings
  await prisma.siteSettings.create({
    data: { id: 1, siteName: 'Test Carta', siteIcon: '' },
  });
}

export interface AuthTokenOptions {
  /** Signing secret; defaults to the app's test secret. */
  secret?: string;
  /** Lifetime in seconds; a negative value gives an already expired token. */
  expiresInSeconds?: number;
  algorithm?: jwt.Algorithm;
  /** Token version (`tv`); users start at 0, as seeded. */
  tokenVersion?: number;
}

/**
 * Get a JWT auth token for the admin user (valid by default).
 * Options build the invalid variants that auth tests need.
 */
export function getAuthToken(userId: number = 1, options: AuthTokenOptions = {}): string {
  const {
    secret = process.env.JWT_SECRET || 'test-secret',
    expiresInSeconds = 3600,
    algorithm = 'HS256',
    tokenVersion = 0,
  } = options;
  return jwt.sign({ userId, tv: tokenVersion }, secret, { expiresIn: expiresInSeconds, algorithm });
}

/**
 * Get auth header object for supertest.
 */
export function authHeader(userId: number = 1): { Authorization: string } {
  return { Authorization: `Bearer ${getAuthToken(userId)}` };
}

// ---- Seed factories ----

export async function seedCategory(overrides: Partial<{
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: string | null;
}> = {}) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'Test Category',
      type: overrides.type ?? 'SPIRIT',
      desiredStock: overrides.desiredStock ?? 1,
      minimumPercent: overrides.minimumPercent ?? 30,
      nameTranslations: overrides.nameTranslations ?? null,
    },
  });
}

export async function seedUnit(overrides: Partial<{
  name: string;
  abbreviation: string;
  conversionFactorToMl: number | null;
  nameTranslations: string | null;
}> = {}) {
  return prisma.unit.create({
    data: {
      name: overrides.name ?? 'Centilitre',
      abbreviation: overrides.abbreviation ?? 'cl',
      conversionFactorToMl: overrides.conversionFactorToMl ?? 10,
      nameTranslations: overrides.nameTranslations ?? null,
    },
  });
}

export async function seedBottle(overrides: Partial<{
  name: string;
  categoryId: number;
  capacityMl: number;
  remainingPercent: number;
  alcoholPercentage: number | null;
  purchasePrice: number | null;
  location: string | null;
  openedAt: Date | null;
  isApero: boolean;
  isDigestif: boolean;
}> = {}) {
  // Ensure a category exists if not provided
  let categoryId = overrides.categoryId;
  if (!categoryId) {
    const cat = await prisma.category.findFirst();
    if (!cat) {
      const newCat = await seedCategory();
      categoryId = newCat.id;
    } else {
      categoryId = cat.id;
    }
  }

  return prisma.bottle.create({
    data: {
      name: overrides.name ?? 'Test Bottle',
      categoryId: categoryId!,
      capacityMl: overrides.capacityMl ?? 700,
      remainingPercent: overrides.remainingPercent ?? 100,
      alcoholPercentage: overrides.alcoholPercentage ?? null,
      purchasePrice: overrides.purchasePrice ?? null,
      location: overrides.location ?? null,
      openedAt: overrides.openedAt ?? null,
      isApero: overrides.isApero ?? false,
      isDigestif: overrides.isDigestif ?? false,
    },
  });
}

export async function seedIngredient(overrides: Partial<{
  name: string;
  icon: string | null;
  isAvailable: boolean;
  nameTranslations: string | null;
}> = {}) {
  return prisma.ingredient.create({
    data: {
      name: overrides.name ?? `Ingredient ${Date.now()}`,
      icon: overrides.icon ?? null,
      isAvailable: overrides.isAvailable ?? true,
      nameTranslations: overrides.nameTranslations ?? null,
    },
  });
}

export async function seedCocktail(overrides: Partial<{
  name: string;
  description: string | null;
  tags: string;
}> = {}) {
  return prisma.cocktail.create({
    data: {
      name: overrides.name ?? 'Test Cocktail',
      description: overrides.description ?? null,
      tags: overrides.tags ?? '',
    },
  });
}

export interface RecipeLineSource {
  sourceType: 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
  bottleId?: number;
  categoryId?: number;
  ingredientId?: number;
  preferredBottleIds?: number[];
  /** Defaults to 1. */
  quantity?: number;
}

/** Nested create of recipe lines, in the order of `sources`, all in the given unit. */
function recipeLinesData(unitId: number, sources: RecipeLineSource[]) {
  return {
    create: sources.map(({ preferredBottleIds = [], quantity = 1, ...source }, position) => ({
      ...source,
      quantity,
      unitId,
      position,
      preferredBottles: { create: preferredBottleIds.map((bottleId) => ({ bottleId })) },
    })),
  };
}

/** Creates a cocktail whose recipe has one line per source, all in the given unit. */
export async function seedCocktailUsing(name: string, unitId: number, sources: RecipeLineSource[]) {
  return prisma.cocktail.create({
    data: { name, ingredients: recipeLinesData(unitId, sources) },
  });
}

export interface FullCocktailOptions {
  name?: string;
  tags?: string;
  /** Unit of every recipe line: the first unit found, or a new one. */
  unitId?: number;
  /** Recipe lines: by default one line on a new bottle. */
  ingredients?: RecipeLineSource[];
  /** Step texts, numbered from 1: by default one step. */
  instructions?: string[];
}

async function findOrSeedUnitId(): Promise<number> {
  const unit = (await prisma.unit.findFirst()) ?? (await seedUnit());
  return unit.id;
}

/**
 * Creates a cocktail with its recipe lines and instructions, plus the unit and
 * bottle it needs, and returns it with these relations.
 */
export async function seedFullCocktail(options: FullCocktailOptions = {}) {
  const unitId = options.unitId ?? await findOrSeedUnitId();
  const ingredients = options.ingredients
    ?? [{ sourceType: 'BOTTLE' as const, bottleId: (await seedBottle()).id }];
  const instructions = options.instructions ?? ['Shake with ice'];

  return prisma.cocktail.create({
    data: {
      name: options.name ?? 'Test Cocktail',
      tags: options.tags ?? '',
      ingredients: recipeLinesData(unitId, ingredients),
      instructions: { create: instructions.map((text, index) => ({ stepNumber: index + 1, text })) },
    },
    include: {
      ingredients: { include: { preferredBottles: true }, orderBy: { position: 'asc' } },
      instructions: { orderBy: { stepNumber: 'asc' } },
    },
  });
}

// Each default slug is new, so that a test can create several menus
let menuCount = 0;

export async function seedMenu(overrides: Partial<{
  name: string;
  slug: string;
  type: 'COCKTAILS' | 'APEROS' | 'DIGESTIFS';
  isPublic: boolean;
  description: string | null;
}> = {}) {
  menuCount += 1;
  const slug = overrides.slug ?? `test-menu-${menuCount}`;
  return prisma.menu.create({
    data: {
      name: overrides.name ?? slug,
      slug,
      type: overrides.type ?? 'COCKTAILS',
      isPublic: overrides.isPublic ?? false,
      description: overrides.description ?? null,
    },
  });
}

export async function seedMenuSection(menuId: number, overrides: Partial<{
  name: string;
  position: number;
}> = {}) {
  return prisma.menuSection.create({
    data: {
      menuId,
      name: overrides.name ?? 'Test Section',
      position: overrides.position ?? 0,
    },
  });
}

export interface MenuEntryOptions {
  position?: number;
  isHidden?: boolean;
  menuSectionId?: number | null;
}

function menuEntryData(options: MenuEntryOptions) {
  return {
    position: options.position ?? 0,
    isHidden: options.isHidden ?? false,
    menuSectionId: options.menuSectionId ?? null,
  };
}

export async function addCocktailToMenu(menuId: number, cocktailId: number, options: MenuEntryOptions = {}) {
  return prisma.menuCocktail.create({ data: { menuId, cocktailId, ...menuEntryData(options) } });
}

export async function addBottleToMenu(menuId: number, bottleId: number, options: MenuEntryOptions = {}) {
  return prisma.menuBottle.create({ data: { menuId, bottleId, ...menuEntryData(options) } });
}

/** One of the two system menus that seedRequiredData creates. */
export async function findSystemMenu(slug: 'aperitifs' | 'digestifs') {
  return prisma.menu.findUniqueOrThrow({ where: { slug } });
}

/** Records that the admin removed the bottle from a system menu, as `DELETE /menu-bottles/:id` does. */
export async function excludeBottleFromMenu(menuId: number, bottleId: number) {
  return prisma.menuBottleExclusion.create({ data: { menuId, bottleId } });
}
