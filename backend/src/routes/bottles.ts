import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const prisma = new PrismaClient();

// Helper function to auto-sync bottle menus when bottle flags change
async function syncBottleMenus(bottleId: number, isApero: boolean, isDigestif: boolean) {
  // Get apero and digestif menus
  const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
  const digestifMenu = await prisma.menu.findUnique({ where: { slug: 'digestifs' } });

  // Sync apero menu
  if (aperoMenu) {
    const existsInApero = await prisma.menuBottle.findFirst({
      where: { menuId: aperoMenu.id, bottleId },
    });

    if (isApero && !existsInApero) {
      // Add to apero menu
      const maxPosition = await prisma.menuBottle.findFirst({
        where: { menuId: aperoMenu.id },
        orderBy: { position: 'desc' },
      });
      await prisma.menuBottle.create({
        data: {
          menuId: aperoMenu.id,
          bottleId,
          position: (maxPosition?.position ?? -1) + 1,
          isHidden: false,
        },
      });
    } else if (!isApero && existsInApero) {
      // Remove from apero menu
      await prisma.menuBottle.delete({ where: { id: existsInApero.id } });
    }
  }

  // Sync digestif menu
  if (digestifMenu) {
    const existsInDigestif = await prisma.menuBottle.findFirst({
      where: { menuId: digestifMenu.id, bottleId },
    });

    if (isDigestif && !existsInDigestif) {
      // Add to digestif menu
      const maxPosition = await prisma.menuBottle.findFirst({
        where: { menuId: digestifMenu.id },
        orderBy: { position: 'desc' },
      });
      await prisma.menuBottle.create({
        data: {
          menuId: digestifMenu.id,
          bottleId,
          position: (maxPosition?.position ?? -1) + 1,
          isHidden: false,
        },
      });
    } else if (!isDigestif && existsInDigestif) {
      // Remove from digestif menu
      await prisma.menuBottle.delete({ where: { id: existsInDigestif.id } });
    }
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, type } = req.query;
    const where: any = {};
    if (categoryId) where.categoryId = parseInt(categoryId as string);
    if (type) where.category = { type: type as string };

    const bottles = await prisma.bottle.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(parseNameTranslations(bottles));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const bottle = await prisma.bottle.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: { category: true },
    });
    if (!bottle) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(parseNameTranslations(bottle));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, categoryId, purchasePrice, capacityMl, remainingPercent, openedAt, alcoholPercentage, isApero, isDigestif } = req.body;
    if (!name || !categoryId || !capacityMl) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const bottle = await prisma.bottle.create({
      data: {
        name,
        categoryId,
        purchasePrice: purchasePrice || null,
        capacityMl,
        remainingPercent: remainingPercent ?? 100,
        openedAt: openedAt ? new Date(openedAt) : null,
        alcoholPercentage: alcoholPercentage || null,
        isApero: isApero ?? false,
        isDigestif: isDigestif ?? false,
      },
      include: { category: true },
    });

    // Auto-sync bottle menus
    await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);

    res.status(201).json(parseNameTranslations(bottle));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, categoryId, purchasePrice, capacityMl, remainingPercent, openedAt, alcoholPercentage, isApero, isDigestif } = req.body;
    const bottle = await prisma.bottle.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId }),
        ...(purchasePrice !== undefined && { purchasePrice }),
        ...(capacityMl && { capacityMl }),
        ...(remainingPercent !== undefined && { remainingPercent }),
        ...(openedAt !== undefined && { openedAt: openedAt ? new Date(openedAt) : null }),
        ...(alcoholPercentage !== undefined && { alcoholPercentage }),
        ...(isApero !== undefined && { isApero }),
        ...(isDigestif !== undefined && { isDigestif }),
      },
      include: { category: true },
    });

    // Auto-sync bottle menus if flags changed
    if (isApero !== undefined || isDigestif !== undefined) {
      await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);
    }

    res.json(parseNameTranslations(bottle));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.bottle.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('bottles.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.cannotDelete') });
  }
});

export default router;
