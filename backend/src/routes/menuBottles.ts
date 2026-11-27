import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MenuIdParams, MessageResponse } from '../validation/common';
import { MenuBottle } from '../validation/menus';
import {
  MenuBottleCreate,
  MenuBottleEntryIds,
  MenuBottleExclusion,
  MenuBottleExclusionParams,
  MenuBottleGroupUpdate,
  MenuBottleIds,
  MenuBottleReorder,
  MenuBottleUpdate,
  MenuSyncResponse,
} from '../validation/menuBottles';
import { apiDocs } from '../openapi/routeDoc';
import { assertSectionInMenu, nextPosition, reorder } from '../services/positions';
import {
  addBottles,
  assertBottlesAllowed,
  excludeBottles,
  isSystemMenu,
  restoreBottles,
  syncMenu,
} from '../services/menuSyncService';

const router = Router();
const doc = apiDocs('Menu bottles');

const MENU_NOT_FOUND = 'No menu has this id.';
const ENTRY_NOT_FOUND = 'No bottle entry has this id.';
const NOT_EXCLUDED = 'The menu does not exist, or a bottle is not excluded from it.';
const ALL_OR_NONE = 'All of them or none: one id that does not fit refuses the request.';
// Exclusions are what the admin removed from a system menu; the sync never adds them back
const SYSTEM_MENU_ONLY =
  'Invalid request, the menu is not a system menu, or a bottle does not fit.';
const PERSONAL_MENU_ONLY =
  'Invalid request, a system menu (its bottles follow their flags), or a bottle the menu type does not allow.';

const BOTTLE_WITH_CATEGORY = { bottle: { include: { category: true } } };

const menuSchemas = { params: MenuIdParams };

router.get(
  '/menu/:menuId',
  doc({
    operationId: 'listMenuBottles',
    summary: 'List the bottles of a menu',
    description: 'In their order, hidden ones included. An unknown menu has none.',
    responses: { 200: z.array(MenuBottle) },
  }),
  validate(menuSchemas),
  async (_req: AuthRequest, res: Response) => {
    const menuBottles = await prisma.menuBottle.findMany({
      where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
      include: BOTTLE_WITH_CATEGORY,
      orderBy: { position: 'asc' },
    });
    res.json(parseNameTranslations(menuBottles));
  },
);

const createSchemas = { body: MenuBottleCreate };

router.post(
  '/',
  doc({
    operationId: 'addMenuBottle',
    summary: 'Add a bottle to a personal menu',
    description: 'The system menus follow the aperitif and digestif flags of the bottles instead.',
    responses: { 201: MenuBottle },
    errors: {
      400: `${PERSONAL_MENU_ONLY} Also when the menu does not exist.`,
      409: 'The bottle is already in the menu.',
    },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { menuId, bottleId, position, isHidden, menuSectionId } =
      valid<typeof createSchemas>(res).body;
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
    res.status(201).json(parseNameTranslations(menuBottle));
  },
);

const updateSchemas = { params: IdParams, body: MenuBottleUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateMenuBottle',
    summary: 'Move, hide or show a bottle of a menu',
    description: 'Only the fields present in the body change.',
    responses: { 200: MenuBottle },
    errors: { 400: 'Invalid request, or a section of another menu.', 404: ENTRY_NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body: { position, isHidden, menuSectionId },
    } = valid<typeof updateSchemas>(res);
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
    res.json(parseNameTranslations(menuBottle));
  },
);

const groupUpdateSchemas = { params: MenuIdParams, body: MenuBottleGroupUpdate };

router.put(
  '/menu/:menuId/entries',
  doc({
    operationId: 'updateMenuBottles',
    summary: 'Hide, show or move several bottles of a menu',
    description: `One change (visibility or section) for every entry listed. ${ALL_OR_NONE}`,
    responses: { 200: MessageResponse },
    errors: {
      400: 'Invalid request, or a section of another menu.',
      404: 'An entry is not in the menu.',
    },
  }),
  validate(groupUpdateSchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { ids, isHidden, menuSectionId },
    } = valid<typeof groupUpdateSchemas>(res);
    const entryIds = [...new Set(ids)];
    await prisma.$transaction(async (tx) => {
      // As for one entry: an id that is not an entry of this menu is not found
      const ownedCount = await tx.menuBottle.count({ where: { menuId, id: { in: entryIds } } });
      if (ownedCount !== entryIds.length) throw new NotFoundError();
      await assertSectionInMenu(tx, menuSectionId, menuId);
      // Absent fields are undefined, which Prisma leaves untouched
      await tx.menuBottle.updateMany({
        where: { id: { in: entryIds } },
        data: { isHidden, menuSectionId },
      });
    });
    res.json({ message: req.t('menuBottles.updated') });
  },
);

const addManySchemas = { params: MenuIdParams, body: MenuBottleIds };

router.post(
  '/menu/:menuId/entries',
  doc({
    operationId: 'addMenuBottles',
    summary: 'Add several bottles at the end of a personal menu',
    description: `In the order given. ${ALL_OR_NONE}`,
    responses: { 201: MessageResponse },
    errors: {
      400: PERSONAL_MENU_ONLY,
      404: MENU_NOT_FOUND,
      409: 'A bottle is already in the menu.',
    },
  }),
  validate(addManySchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { bottleIds },
    } = valid<typeof addManySchemas>(res);
    await prisma.$transaction((tx) => addBottles(tx, menuId, bottleIds));
    res.status(201).json({ message: req.t('menuBottles.added') });
  },
);

const removeManySchemas = { params: MenuIdParams, body: MenuBottleEntryIds };

router.post(
  '/menu/:menuId/entries/remove',
  doc({
    operationId: 'removeMenuBottles',
    summary: 'Remove several bottles from a menu',
    description: `As \`DELETE /api/menu-bottles/{id}\` does for one: on a system menu, each removal is kept as an exclusion. ${ALL_OR_NONE}`,
    responses: { 200: MessageResponse },
    errors: { 404: 'The menu does not exist, or an entry is not in it.' },
  }),
  validate(removeManySchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { ids },
    } = valid<typeof removeManySchemas>(res);
    const entryIds = [...new Set(ids)];
    await prisma.$transaction(async (tx) => {
      const entries = await tx.menuBottle.findMany({
        where: { menuId, id: { in: entryIds } },
        select: { bottleId: true, menu: { select: { slug: true } } },
      });
      // As for one entry: an id that is not an entry of this menu is not found
      if (entries.length !== entryIds.length) throw new NotFoundError();
      if (isSystemMenu(entries[0].menu)) {
        await excludeBottles(
          tx,
          menuId,
          entries.map((entry) => entry.bottleId),
        );
      } else {
        await tx.menuBottle.deleteMany({ where: { id: { in: entryIds } } });
      }
    });
    res.json({ message: req.t('menuBottles.removed') });
  },
);

const reorderSchemas = { params: MenuIdParams, body: MenuBottleReorder };

router.post(
  '/menu/:menuId/reorder',
  doc({
    operationId: 'reorderMenuBottles',
    summary: 'Reorder the bottles of a menu',
    description: '`ids` lists every entry of the menu, in its new order.',
    responses: { 200: MessageResponse },
    errors: {
      400: 'Invalid request, or the ids are not exactly the entries of the menu.',
      404: MENU_NOT_FOUND,
    },
  }),
  validate(reorderSchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { ids },
    } = valid<typeof reorderSchemas>(res);
    await prisma.$transaction((tx) => reorder(tx, 'menuBottle', menuId, ids));
    res.json({ message: req.t('menuBottles.reordered') });
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'removeMenuBottle',
    summary: 'Remove a bottle from a menu',
    description:
      'On a system menu, the removal is kept as an exclusion: the sync never adds the bottle back.',
    responses: { 200: MessageResponse },
    errors: { 404: ENTRY_NOT_FOUND },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
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
  },
);

router.post(
  '/menu/:menuId/sync',
  doc({
    operationId: 'syncSystemMenu',
    summary: 'Sync a system menu with the flags of the bottles',
    description:
      'Adds the bottles flagged for the menu type, except its exclusions, and removes the others.',
    responses: { 200: MenuSyncResponse },
    errors: { 400: 'Invalid request, or not a system menu.', 404: MENU_NOT_FOUND },
  }),
  validate(menuSchemas),
  async (req: AuthRequest, res: Response) => {
    const { menuId } = valid<typeof menuSchemas>(res).params;
    const { added, removed } = await prisma.$transaction((tx) => syncMenu(tx, menuId));
    res.json({ message: req.t('menuBottles.synced'), added, removed });
  },
);

router.get(
  '/menu/:menuId/exclusions',
  doc({
    operationId: 'listMenuExclusions',
    summary: 'List the bottles removed from a system menu',
    description: 'A personal menu has none.',
    responses: { 200: z.array(MenuBottleExclusion) },
    errors: { 404: MENU_NOT_FOUND },
  }),
  validate(menuSchemas),
  async (_req: AuthRequest, res: Response) => {
    const exclusions = await prisma.menuBottleExclusion.findMany({
      where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
      include: BOTTLE_WITH_CATEGORY,
      orderBy: { bottle: { name: 'asc' } },
    });
    res.json(parseNameTranslations(exclusions));
  },
);

const excludeSchemas = { params: MenuIdParams, body: MenuBottleIds };

router.post(
  '/menu/:menuId/exclusions',
  doc({
    operationId: 'excludeMenuBottles',
    summary: 'Remove several bottles from a system menu',
    description: `Each one becomes an exclusion. ${ALL_OR_NONE}`,
    responses: { 200: MessageResponse },
    errors: { 400: SYSTEM_MENU_ONLY, 404: MENU_NOT_FOUND },
  }),
  validate(excludeSchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { bottleIds },
    } = valid<typeof excludeSchemas>(res);
    await prisma.$transaction((tx) => excludeBottles(tx, menuId, bottleIds));
    res.json({ message: req.t('menuBottles.excluded') });
  },
);

const restoreManySchemas = { params: MenuIdParams, body: MenuBottleIds };

router.post(
  '/menu/:menuId/exclusions/restore',
  doc({
    operationId: 'restoreMenuBottles',
    summary: 'Put several excluded bottles back in a system menu',
    description: `At the end of the menu. ${ALL_OR_NONE}`,
    responses: { 200: MessageResponse },
    errors: { 400: SYSTEM_MENU_ONLY, 404: NOT_EXCLUDED },
  }),
  validate(restoreManySchemas),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { bottleIds },
    } = valid<typeof restoreManySchemas>(res);
    await prisma.$transaction((tx) => restoreBottles(tx, menuId, bottleIds));
    res.json({ message: req.t('menuBottles.restoredMany') });
  },
);

const restoreSchemas = { params: MenuBottleExclusionParams };

router.delete(
  '/menu/:menuId/exclusions/:bottleId',
  doc({
    operationId: 'restoreMenuBottle',
    summary: 'Put an excluded bottle back in a system menu',
    description: 'At the end of the menu.',
    responses: { 200: MessageResponse },
    errors: { 400: SYSTEM_MENU_ONLY, 404: NOT_EXCLUDED },
  }),
  validate(restoreSchemas),
  async (req: AuthRequest, res: Response) => {
    const { menuId, bottleId } = valid<typeof restoreSchemas>(res).params;
    await prisma.$transaction((tx) => restoreBottles(tx, menuId, [bottleId]));
    res.json({ message: req.t('menuBottles.restored') });
  },
);

export default router;
