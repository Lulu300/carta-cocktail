import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

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

    res.json(menu);
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

    res.json(cocktail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
