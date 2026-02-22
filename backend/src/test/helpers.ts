import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import app from '../app';

const TEST_DB_PATH = path.resolve(__dirname, '../../prisma/test.db');

export const prisma = new PrismaClient();
export const request = supertest(app);

/**
 * Create the test database schema via prisma db push.
 * Call in beforeAll().
 */
export async function setupTestDatabase(): Promise<void> {
  // Remove old test DB files
  for (const suffix of ['', '-wal', '-journal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // Push schema to create tables
  execSync('npx prisma db push --skip-generate --force-reset', {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      DATABASE_URL: `file:./prisma/test.db`,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes',
    },
    stdio: 'pipe',
  });

  // Reconnect prisma after DB recreation
  await prisma.$connect();
}

/**
 * Disconnect Prisma and remove test DB files.
 * Call in afterAll().
 */
export async function teardownTestDatabase(): Promise<void> {
  await prisma.$disconnect();
  for (const suffix of ['', '-wal', '-journal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

/**
 * Delete all data from all tables in correct FK order.
 * Call in beforeEach().
 */
export async function cleanDatabase(): Promise<void> {
  // Delete in dependency order (children first)
  await prisma.menuCocktail.deleteMany();
  await prisma.menuBottle.deleteMany();
  await prisma.menuSection.deleteMany();
  await prisma.cocktailPreferredBottle.deleteMany();
  await prisma.cocktailInstruction.deleteMany();
  await prisma.cocktailIngredient.deleteMany();
  await prisma.cocktail.deleteMany();
  await prisma.bottle.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryType.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.siteSettings.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Seed the minimum required data after cleanDatabase.
 * Call in beforeEach() after cleanDatabase().
 */
export async function seedRequiredData(): Promise<void> {
  // Create admin user
  const hash = await bcrypt.hash('testpass123', 10);
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

/**
 * Get a valid JWT auth token for the admin user.
 */
export function getAuthToken(userId: number = 1): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
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
  nameTranslations: string | null;
}> = {}) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'Test Category',
      type: overrides.type ?? 'SPIRIT',
      desiredStock: overrides.desiredStock ?? 1,
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
  purchasePrice: number | null;
  location: string | null;
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
      purchasePrice: overrides.purchasePrice ?? null,
      location: overrides.location ?? null,
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
