import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseNameTranslations } from '../utils/translations';
import { AuthRequest, optionalAuth } from '../middleware/auth';

const parseNT = (val: any) => {
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val || null;
};

const router = Router();
const prisma = new PrismaClient();

// Public responses use explicit selects so inventory data (purchase price,
// opening date, remaining level) never leaves the server.
const CATEGORY_PUBLIC_SELECT = {
  id: true, name: true, nameTranslations: true, type: true,
} satisfies Prisma.CategorySelect;

const MENU_BOTTLE_PUBLIC_SELECT = {
  id: true, name: true, capacityMl: true, categoryId: true, alcoholPercentage: true, location: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
} satisfies Prisma.BottleSelect;

const INGREDIENT_BOTTLE_PUBLIC_SELECT = {
  id: true, name: true, alcoholPercentage: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
} satisfies Prisma.BottleSelect;

const INGREDIENT_PUBLIC_SELECT = {
  id: true, name: true, nameTranslations: true, icon: true,
} satisfies Prisma.IngredientSelect;

// Hidden menu items and empty bottles are never served, even in admin preview:
// the public page does not display them either.
const VISIBLE_MENU_COCKTAIL_WHERE = { isHidden: false } satisfies Prisma.MenuCocktailWhereInput;
const VISIBLE_MENU_BOTTLE_WHERE = {
  isHidden: false,
  bottle: { remainingPercent: { gt: 0 } },
} satisfies Prisma.MenuBottleWhereInput;

// Notes and preferred bottles are private: only a verified admin gets them.
function buildCocktailSelect(isAdmin: boolean) {
  return {
    id: true, name: true, description: true, imagePath: true, tags: true, isAvailable: true,
    notes: isAdmin,
    ingredients: {
      select: {
        id: true, quantity: true, position: true, sourceType: true,
        unit: true,
        category: { select: CATEGORY_PUBLIC_SELECT },
        ingredient: { select: INGREDIENT_PUBLIC_SELECT },
        bottle: { select: INGREDIENT_BOTTLE_PUBLIC_SELECT },
        preferredBottles: isAdmin
          ? { select: { id: true, bottle: { select: INGREDIENT_BOTTLE_PUBLIC_SELECT } } }
          : false,
      },
      orderBy: { position: 'asc' },
    },
    instructions: {
      select: { id: true, stepNumber: true, text: true },
      orderBy: { stepNumber: 'asc' },
    },
  } satisfies Prisma.CocktailSelect;
}

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

router.use(optionalAuth);

// List all public menus
router.get('/menus', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get public menu by slug (or admin preview)
router.get('/menus/:slug', async (req: AuthRequest, res: Response) => {
  try {
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
            cocktail: { select: buildCocktailSelect(isAdmin) },
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
    if (!menu || (!menu.isPublic && !isAdmin)) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    res.json(parseNameTranslations(menu));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get site settings (public)
router.get('/settings', async (req: Request, res: Response) => {
  try {
    let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.siteSettings.create({
        data: { id: 1, siteName: 'Carta Cocktail', siteIcon: '' },
      });
    }
    res.json({ siteName: settings.siteName, siteIcon: settings.siteIcon });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Export public cocktail as JSON
router.get('/cocktails/:id/export', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseCocktailId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    const isAdmin = isAdminRequest(req);
    const cocktail = await prisma.cocktail.findFirst({
      where: buildPublicCocktailWhere(id, isAdmin),
      include: {
        ingredients: {
          include: {
            unit: true,
            bottle: { include: { category: true } },
            category: true,
            ingredient: true,
            preferredBottles: isAdmin
              ? { include: { bottle: { include: { category: true } } } }
              : false,
          },
          orderBy: { position: 'asc' },
        },
        instructions: { orderBy: { stepNumber: 'asc' } },
      },
    });

    if (!cocktail) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    // Build export payload (same logic as admin export, minus private fields for guests)
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      cocktail: {
        name: cocktail.name,
        description: cocktail.description || null,
        ...(isAdmin && { notes: cocktail.notes || null }),
        tags: cocktail.tags ? cocktail.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        ingredients: (cocktail.ingredients || []).map((ing: any) => {
          let sourceName = '';
          let sourceDetail: any = {};
          if (ing.sourceType === 'BOTTLE' && ing.bottle) {
            sourceName = ing.bottle.name;
            sourceDetail = {
              categoryName: ing.bottle.category?.name || '',
              categoryType: ing.bottle.category?.type || 'SPIRIT',
              categoryNameTranslations: parseNT(ing.bottle.category?.nameTranslations),
            };
          } else if (ing.sourceType === 'CATEGORY' && ing.category) {
            sourceName = ing.category.name;
            sourceDetail = {
              type: ing.category.type,
              desiredStock: ing.category.desiredStock,
              nameTranslations: parseNT(ing.category.nameTranslations),
            };
          } else if (ing.sourceType === 'INGREDIENT' && ing.ingredient) {
            sourceName = ing.ingredient.name;
            sourceDetail = {
              icon: ing.ingredient.icon || null,
              nameTranslations: parseNT(ing.ingredient.nameTranslations),
            };
          }
          return {
            sourceType: ing.sourceType,
            sourceName,
            sourceDetail,
            quantity: ing.quantity,
            unit: ing.unit ? {
              name: ing.unit.name,
              abbreviation: ing.unit.abbreviation,
              conversionFactorToMl: ing.unit.conversionFactorToMl,
              nameTranslations: parseNT(ing.unit.nameTranslations),
            } : null,
            position: ing.position,
            ...(isAdmin && {
              preferredBottles: (ing.preferredBottles || []).map((pb: any) => ({
                name: pb.bottle?.name || '',
                categoryName: pb.bottle?.category?.name || ing.category?.name || '',
              })),
            }),
          };
        }),
        instructions: (cocktail.instructions || []).map((inst: any) => ({ stepNumber: inst.stepNumber, text: inst.text })),
      },
    };

    const slug = cocktail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="cocktail-${slug}.json"`);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// List all units (public, needed for unit conversion on public pages)
router.get('/units', async (req: Request, res: Response) => {
  try {
    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(units);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get public cocktail detail
router.get('/cocktails/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseCocktailId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    const isAdmin = isAdminRequest(req);
    const cocktail = await prisma.cocktail.findFirst({
      where: buildPublicCocktailWhere(id, isAdmin),
      select: buildCocktailSelect(isAdmin),
    });

    if (!cocktail) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    res.json(parseNameTranslations(cocktail));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
