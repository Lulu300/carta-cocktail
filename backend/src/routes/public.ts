import { Router, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { parseNameTranslations } from '../utils/translations';
import { AuthRequest, optionalAuth } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { calculateAvailabilities } from '../services/availabilityService';
import { buildPublicCocktailSelect, CATEGORY_PUBLIC_SELECT } from '../services/cocktail/includes';
import { exportCocktail } from '../services/cocktail/cocktailExport';

const router = Router();

// Bottles of a bottle menu: inventory fields stay on the server (see includes.ts)
const MENU_BOTTLE_PUBLIC_SELECT = {
  id: true, name: true, capacityMl: true, categoryId: true, alcoholPercentage: true, location: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
} satisfies Prisma.BottleSelect;

// Hidden menu items and empty bottles are never served, even in admin preview:
// the public page does not display them either.
const VISIBLE_MENU_COCKTAIL_WHERE = { isHidden: false } satisfies Prisma.MenuCocktailWhereInput;
const VISIBLE_MENU_BOTTLE_WHERE = {
  isHidden: false,
  bottle: { remainingPercent: { gt: 0 } },
} satisfies Prisma.MenuBottleWhereInput;

// A guest only reaches cocktails that are visible in at least one published menu.
// The admin can preview any cocktail.
function buildPublicCocktailWhere(id: number, isAdmin: boolean): Prisma.CocktailWhereInput {
  if (isAdmin) return { id };
  return {
    id,
    menuCocktails: { some: { ...VISIBLE_MENU_COCKTAIL_WHERE, menu: { isPublic: true } } },
  };
}

function parseCocktailId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isAdminRequest(req: AuthRequest): boolean {
  return req.userId !== undefined;
}

/**
 * Adds `available` to each cocktail. Decision of 2026-10-08: a guest sees a
 * cocktail as available only when the manual switch (`isAvailable`, still
 * returned as is for the admin) is on AND the stock allows one serving.
 * One stock load for the whole list.
 */
async function withPublicAvailability<T extends { id: number; isAvailable: boolean }>(
  cocktails: T[],
): Promise<(T & { available: boolean })[]> {
  const availabilities = await calculateAvailabilities(prisma, cocktails.map(({ id }) => id));
  return cocktails.map((cocktail) => {
    const maxServings = availabilities.get(cocktail.id)?.maxServings ?? 0;
    return { ...cocktail, available: cocktail.isAvailable && maxServings > 0 };
  });
}

router.use(optionalAuth);

// List all public menus
router.get('/menus', async (_req: Request, res: Response) => {
  const menus = await prisma.menu.findMany({
    where: { isPublic: true },
    include: {
      _count: {
        select: {
          cocktails: { where: VISIBLE_MENU_COCKTAIL_WHERE },
          bottles: { where: VISIBLE_MENU_BOTTLE_WHERE },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(menus);
});

// Get public menu by slug (or admin preview)
router.get('/menus/:slug', async (req: AuthRequest, res: Response) => {
  const isAdmin = isAdminRequest(req);
  const menu = await prisma.menu.findUnique({
    where: { slug: String(req.params.slug) },
    include: {
      sections: {
        orderBy: { position: 'asc' },
      },
      cocktails: {
        where: VISIBLE_MENU_COCKTAIL_WHERE,
        include: {
          cocktail: { select: buildPublicCocktailSelect(isAdmin) },
        },
        orderBy: { position: 'asc' },
      },
      bottles: {
        where: VISIBLE_MENU_BOTTLE_WHERE,
        include: {
          bottle: { select: MENU_BOTTLE_PUBLIC_SELECT },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  // Unpublished menus are only visible to a verified admin (preview)
  if (!menu || (!menu.isPublic && !isAdmin)) throw new NotFoundError();

  const cocktails = await withPublicAvailability(menu.cocktails.map(({ cocktail }) => cocktail));
  const menuCocktails = menu.cocktails.map((menuCocktail, index) => ({ ...menuCocktail, cocktail: cocktails[index] }));
  res.json(parseNameTranslations({ ...menu, cocktails: menuCocktails }));
});

// Get site settings (public)
router.get('/settings', async (_req: Request, res: Response) => {
  let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.siteSettings.create({
      data: { id: 1, siteName: 'Carta Cocktail', siteIcon: '' },
    });
  }
  res.json({ siteName: settings.siteName, siteIcon: settings.siteIcon });
});

// Export public cocktail as JSON
router.get('/cocktails/:id/export', async (req: AuthRequest, res: Response) => {
  const id = parseCocktailId(req.params.id);
  if (id === null) throw new NotFoundError();

  const isAdmin = isAdminRequest(req);
  const exported = await exportCocktail(buildPublicCocktailWhere(id, isAdmin), { includePrivate: isAdmin });
  if (!exported) throw new NotFoundError();
  res.attachment(exported.filename).json(exported.payload);
});

// List all units (public, needed for unit conversion on public pages)
router.get('/units', async (_req: Request, res: Response) => {
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  res.json(units);
});

// Get public cocktail detail
router.get('/cocktails/:id', async (req: AuthRequest, res: Response) => {
  const id = parseCocktailId(req.params.id);
  if (id === null) throw new NotFoundError();

  const isAdmin = isAdminRequest(req);
  const cocktail = await prisma.cocktail.findFirst({
    where: buildPublicCocktailWhere(id, isAdmin),
    select: buildPublicCocktailSelect(isAdmin),
  });

  if (!cocktail) throw new NotFoundError();

  const [publicCocktail] = await withPublicAvailability([cocktail]);
  res.json(parseNameTranslations(publicCocktail));
});

export default router;
