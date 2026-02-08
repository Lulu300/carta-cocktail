import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parseNameTranslations } from '../utils/translations';

const parseNT = (val: any) => {
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val || null;
};

const router = Router();
const prisma = new PrismaClient();

// List all public menus
router.get('/menus', async (req: Request, res: Response) => {
  try {
    const menus = await prisma.menu.findMany({
      where: { isPublic: true },
      include: {
        _count: { select: { cocktails: true, bottles: true } },
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
router.get('/menus/:slug', async (req: Request, res: Response) => {
  try {
    const menu = await prisma.menu.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        sections: {
          orderBy: { position: 'asc' },
        },
        cocktails: {
          include: {
            cocktail: {
              include: {
                ingredients: {
                  include: { unit: true, bottle: true, category: true, ingredient: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
        bottles: {
          include: {
            bottle: {
              include: { category: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!menu) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    // Check if user is authenticated (admin) via Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    const isAdmin = !!token; // If there's a token, user is logged in (admin)

    // Allow if public OR if admin
    if (!menu.isPublic && !isAdmin) {
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
router.get('/cocktails/:id/export', async (req: Request, res: Response) => {
  try {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: {
        ingredients: {
          include: {
            unit: true,
            bottle: { include: { category: true } },
            category: true,
            ingredient: true,
            preferredBottles: { include: { bottle: { include: { category: true } } } },
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

    // Build export payload (same logic as admin export)
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      cocktail: {
        name: cocktail.name,
        description: cocktail.description || null,
        notes: cocktail.notes || null,
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
            preferredBottles: (ing.preferredBottles || []).map((pb: any) => ({
              name: pb.bottle?.name || '',
              categoryName: pb.bottle?.category?.name || ing.category?.name || '',
            })),
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

// Get public cocktail detail
router.get('/cocktails/:id', async (req: Request, res: Response) => {
  try {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: {
        ingredients: {
          include: {
            unit: true,
            bottle: { include: { category: true } },
            category: true,
            ingredient: true,
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

    res.json(parseNameTranslations(cocktail));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
