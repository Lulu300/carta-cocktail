import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MenuIdParams } from '../validation/common';
import { MenuBottleCreate, MenuBottleUpdate } from '../validation/menuBottles';

const router = Router();

// Get all bottles for a menu
const menuSchemas = { params: MenuIdParams };

router.get('/menu/:menuId', validate(menuSchemas), async (_req: AuthRequest, res: Response) => {
  const menuBottles = await prisma.menuBottle.findMany({
    where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
    include: {
      bottle: {
        include: { category: true },
      },
    },
    orderBy: { position: 'asc' },
  });
  res.json(menuBottles);
});

// Add bottle to menu
const createSchemas = { body: MenuBottleCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { menuId, bottleId, position, isHidden } = valid<typeof createSchemas>(res).body;
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
});

// Update menu bottle (position or visibility)
const updateSchemas = { params: IdParams, body: MenuBottleUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body: { position, isHidden, menuSectionId } } = valid<typeof updateSchemas>(res);
  // Absent fields are undefined, which Prisma leaves untouched
  const menuBottle = await prisma.menuBottle.update({
    where: { id },
    data: { position, isHidden, menuSectionId },
    include: {
      bottle: {
        include: { category: true },
      },
    },
  });
  res.json(menuBottle);
});

// Remove bottle from menu
router.delete('/:id', validate(idRequest), async (req: AuthRequest, res: Response) => {
  await prisma.menuBottle.delete({ where: { id: valid<typeof idRequest>(res).params.id } });
  res.json({ message: req.t('menuBottles.deleted') });
});

// Sync bottles for a menu based on bottle flags (isApero/isDigestif)
router.post('/menu/:menuId/sync', validate(menuSchemas), async (req: AuthRequest, res: Response) => {
  const { menuId } = valid<typeof menuSchemas>(res).params;

  // Get the menu to check its type
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
  });

  if (!menu) throw new NotFoundError();

  // Determine which bottles to sync based on menu type
  let bottleFilter: Prisma.BottleWhereInput;
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
});

export default router;
