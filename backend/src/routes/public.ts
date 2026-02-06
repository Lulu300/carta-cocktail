import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get public menu by slug
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
      },
    });

    if (!menu || !menu.isPublic) {
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
