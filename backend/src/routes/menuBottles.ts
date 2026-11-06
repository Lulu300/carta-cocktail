import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MenuIdParams } from '../validation/common';
import {
  MenuBottleCreate,
  MenuBottleExclusionCreate,
  MenuBottleExclusionParams,
  MenuBottleReorder,
  MenuBottleUpdate,
} from '../validation/menuBottles';
import { assertSectionInMenu, nextPosition, reorder } from '../services/positions';
import {
  assertBottlesAllowed,
  excludeBottles,
  isSystemMenu,
  restoreBottle,
  syncMenu,
} from '../services/menuSyncService';

const router = Router();

const BOTTLE_WITH_CATEGORY = { bottle: { include: { category: true } } };

// Get all bottles for a menu
const menuSchemas = { params: MenuIdParams };

router.get('/menu/:menuId', validate(menuSchemas), async (_req: AuthRequest, res: Response) => {
  const menuBottles = await prisma.menuBottle.findMany({
    where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
    include: BOTTLE_WITH_CATEGORY,
    orderBy: { position: 'asc' },
  });
  res.json(menuBottles);
});

// Add bottle to a personal menu: the system menus follow the bottles' flags
const createSchemas = { body: MenuBottleCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { menuId, bottleId, position, isHidden, menuSectionId } = valid<typeof createSchemas>(res).body;
  const menuBottle = await prisma.$transaction(async (tx) => {
    const menu = await tx.menu.findUnique({ where: { id: menuId } });
    // An unknown id in the body is a bad request, as the foreign key used to answer
    if (!menu) throw new BadRequestError();
    if (isSystemMenu(menu)) throw new BadRequestError('errors.systemMenuBottlesManaged');
    await assertBottlesAllowed(tx, menu, [bottleId]);
    await assertSectionInMenu(tx, menuSectionId, menuId);

    return tx.menuBottle.create({
      data: {
        menuId,
        bottleId,
        position: position ?? (await nextPosition(tx, 'menuBottle', menuId)),
        isHidden: isHidden ?? false,
        menuSectionId,
      },
      include: BOTTLE_WITH_CATEGORY,
    });
  });
  res.status(201).json(menuBottle);
});

// Update menu bottle (position or visibility)
const updateSchemas = { params: IdParams, body: MenuBottleUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body: { position, isHidden, menuSectionId } } = valid<typeof updateSchemas>(res);
  const menuBottle = await prisma.$transaction(async (tx) => {
    const entry = await tx.menuBottle.findUnique({ where: { id }, select: { menuId: true } });
    if (!entry) throw new NotFoundError();
    await assertSectionInMenu(tx, menuSectionId, entry.menuId);
    // Absent fields are undefined, which Prisma leaves untouched
    return tx.menuBottle.update({
      where: { id },
      data: { position, isHidden, menuSectionId },
      include: BOTTLE_WITH_CATEGORY,
    });
  });
  res.json(menuBottle);
});

// Reorder all the bottles of a menu at once: ids lists every entry of the menu, in its new order
const reorderSchemas = { params: MenuIdParams, body: MenuBottleReorder };

router.post('/menu/:menuId/reorder', validate(reorderSchemas), async (req: AuthRequest, res: Response) => {
  const { params: { menuId }, body: { ids } } = valid<typeof reorderSchemas>(res);
  await prisma.$transaction((tx) => reorder(tx, 'menuBottle', menuId, ids));
  res.json({ message: req.t('menuBottles.reordered') });
});

// Remove bottle from menu: on a system menu, the removal is kept as an exclusion
router.delete('/:id', validate(idRequest), async (req: AuthRequest, res: Response) => {
  const { id } = valid<typeof idRequest>(res).params;
  await prisma.$transaction(async (tx) => {
    const entry = await tx.menuBottle.findUnique({ where: { id }, include: { menu: true } });
    if (!entry) throw new NotFoundError();
    if (isSystemMenu(entry.menu)) {
      await excludeBottles(tx, entry.menuId, [entry.bottleId]);
    } else {
      await tx.menuBottle.delete({ where: { id } });
    }
  });
  res.json({ message: req.t('menuBottles.deleted') });
});

// Sync a system menu with the bottles' flags (isApero/isDigestif) and its exclusions
router.post('/menu/:menuId/sync', validate(menuSchemas), async (req: AuthRequest, res: Response) => {
  const { menuId } = valid<typeof menuSchemas>(res).params;
  const { added, removed } = await prisma.$transaction((tx) => syncMenu(tx, menuId));
  res.json({ message: req.t('menuBottles.synced'), added, removed });
});

// Bottles removed from a system menu; a personal menu has none
router.get('/menu/:menuId/exclusions', validate(menuSchemas), async (_req: AuthRequest, res: Response) => {
  const exclusions = await prisma.menuBottleExclusion.findMany({
    where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
    include: BOTTLE_WITH_CATEGORY,
    orderBy: { bottle: { name: 'asc' } },
  });
  res.json(exclusions);
});

// Remove several bottles from a system menu at once: all of them or none
const excludeSchemas = { params: MenuIdParams, body: MenuBottleExclusionCreate };

router.post('/menu/:menuId/exclusions', validate(excludeSchemas), async (req: AuthRequest, res: Response) => {
  const { params: { menuId }, body: { bottleIds } } = valid<typeof excludeSchemas>(res);
  await prisma.$transaction((tx) => excludeBottles(tx, menuId, bottleIds));
  res.json({ message: req.t('menuBottles.excluded') });
});

// Put an excluded bottle back at the end of its system menu
const restoreSchemas = { params: MenuBottleExclusionParams };

router.delete('/menu/:menuId/exclusions/:bottleId', validate(restoreSchemas), async (req: AuthRequest, res: Response) => {
  const { menuId, bottleId } = valid<typeof restoreSchemas>(res).params;
  await prisma.$transaction((tx) => restoreBottle(tx, menuId, bottleId));
  res.json({ message: req.t('menuBottles.restored') });
});

export default router;
