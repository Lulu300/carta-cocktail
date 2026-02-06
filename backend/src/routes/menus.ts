import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// List all menus
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const menus = await prisma.menu.findMany({
      include: { _count: { select: { cocktails: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(menus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get one menu with cocktails
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const menu = await prisma.menu.findUnique({
      where: { id: parseInt(String(req.params.id)) },
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
    if (!menu) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(menu);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Create menu
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, slug, isPublic } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const menu = await prisma.menu.create({
      data: {
        name,
        description: description || null,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        isPublic: isPublic ?? false,
      },
    });
    res.status(201).json(menu);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update menu
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, slug, isPublic, cocktails } = req.body;

    // If cocktails array provided, update the associations
    if (cocktails) {
      await prisma.menuCocktail.deleteMany({ where: { menuId: parseInt(String(req.params.id)) } });
      await prisma.menuCocktail.createMany({
        data: cocktails.map((c: any, index: number) => ({
          menuId: parseInt(String(req.params.id)),
          cocktailId: c.cocktailId,
          position: c.position ?? index,
          isHidden: c.isHidden ?? false,
        })),
      });
    }

    const menu = await prisma.menu.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(slug && { slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') }),
        ...(isPublic !== undefined && { isPublic }),
      },
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    res.json(menu);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Delete menu
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.menu.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('menus.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
