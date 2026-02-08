import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all bottles for a menu
router.get('/menu/:menuId', async (req: AuthRequest, res: Response) => {
  try {
    const menuBottles = await prisma.menuBottle.findMany({
      where: { menuId: parseInt(String(req.params.menuId)) },
      include: {
        bottle: {
          include: { category: true },
        },
      },
      orderBy: { position: 'asc' },
    });
    res.json(menuBottles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Add bottle to menu
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { menuId, bottleId, position, isHidden } = req.body;
    if (!menuId || !bottleId) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const menuBottle = await prisma.menuBottle.create({
      data: {
        menuId,
        bottleId,
        position: position ?? 0,
        isHidden: isHidden ?? false,
      },
      include: {
        bottle: {
          include: { category: true },
        },
      },
    });
    res.status(201).json(menuBottle);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update menu bottle (position or visibility)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { position, isHidden, menuSectionId } = req.body;
    const menuBottle = await prisma.menuBottle.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(position !== undefined && { position }),
        ...(isHidden !== undefined && { isHidden }),
        ...(menuSectionId !== undefined && { menuSectionId }),
      },
      include: {
        bottle: {
          include: { category: true },
        },
      },
    });
    res.json(menuBottle);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Remove bottle from menu
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.menuBottle.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('menuBottles.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Sync bottles for a menu based on bottle flags (isApero/isDigestif)
router.post('/menu/:menuId/sync', async (req: AuthRequest, res: Response) => {
  try {
    const menuId = parseInt(String(req.params.menuId));

    // Get the menu to check its type
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
    });

    if (!menu) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    // Determine which bottles to sync based on menu type
    let bottleFilter: any = {};
    if (menu.type === 'APEROS') {
      bottleFilter = { isApero: true };
    } else if (menu.type === 'DIGESTIFS') {
      bottleFilter = { isDigestif: true };
    } else {
      res.status(400).json({ error: 'Cannot sync bottles for cocktail menus' });
      return;
    }

    // Get all bottles matching the menu type
    const bottles = await prisma.bottle.findMany({
      where: bottleFilter,
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    // Get existing menu-bottle associations
    const existingMenuBottles = await prisma.menuBottle.findMany({
      where: { menuId },
    });

    const existingBottleIds = new Set(existingMenuBottles.map(mb => mb.bottleId));

    // Add new bottles that aren't already in the menu
    const newBottles = bottles.filter(b => !existingBottleIds.has(b.id));

    if (newBottles.length > 0) {
      // Get the max position
      const maxPosition = existingMenuBottles.length > 0
        ? Math.max(...existingMenuBottles.map(mb => mb.position))
        : -1;

      await prisma.menuBottle.createMany({
        data: newBottles.map((b, index) => ({
          menuId,
          bottleId: b.id,
          position: maxPosition + 1 + index,
          isHidden: false,
        })),
      });
    }

    // Remove bottles that no longer have the appropriate flag
    const validBottleIds = new Set(bottles.map(b => b.id));
    const toRemove = existingMenuBottles.filter(mb => !validBottleIds.has(mb.bottleId));

    if (toRemove.length > 0) {
      await prisma.menuBottle.deleteMany({
        where: {
          id: { in: toRemove.map(mb => mb.id) },
        },
      });
    }

    res.json({
      message: req.t('menuBottles.synced'),
      added: newBottles.length,
      removed: toRemove.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
