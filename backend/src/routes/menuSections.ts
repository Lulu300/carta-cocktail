import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MenuIdParams, MessageResponse } from '../validation/common';
import {
  MenuSection,
  MenuSectionCreate,
  MenuSectionReorder,
  MenuSectionUpdate,
} from '../validation/menuSections';
import { nextPosition, reorder } from '../services/positions';
import { apiDocs } from '../openapi/routeDoc';

const router = Router();
const doc = apiDocs('Menu sections');

const SECTION_NOT_FOUND = 'No section has this id.';

const menuSchemas = { params: MenuIdParams };

router.get(
  '/menu/:menuId/sections',
  doc({
    operationId: 'listMenuSections',
    summary: 'List the sections of a menu',
    description: 'In their order. An unknown menu has none.',
    responses: { 200: z.array(MenuSection) },
  }),
  validate(menuSchemas),
  async (_req: AuthRequest, res: Response) => {
    const sections = await prisma.menuSection.findMany({
      where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
      orderBy: { position: 'asc' },
    });
    res.json(sections);
  },
);

const createSchemas = { params: MenuIdParams, body: MenuSectionCreate };

router.post(
  '/menu/:menuId/sections',
  doc({
    operationId: 'createMenuSection',
    summary: 'Add a section at the end of a menu',
    responses: { 201: MenuSection },
    errors: { 400: 'Invalid request, or the menu does not exist.' },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { menuId },
      body: { name },
    } = valid<typeof createSchemas>(res);

    // One transaction for the read and the insert, so a concurrent insert cannot take the same position
    const section = await prisma.$transaction(async (tx) =>
      tx.menuSection.create({
        data: { menuId, name, position: await nextPosition(tx, 'menuSection', menuId) },
      }),
    );

    res.status(201).json(section);
  },
);

const updateSchemas = { params: IdParams, body: MenuSectionUpdate };

router.put(
  '/sections/:id',
  doc({
    operationId: 'updateMenuSection',
    summary: 'Rename or move a section',
    description: 'Only the fields present in the body change.',
    responses: { 200: MenuSection },
    errors: { 404: SECTION_NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body: { name, position },
    } = valid<typeof updateSchemas>(res);
    // Absent fields are undefined, which Prisma leaves untouched
    const section = await prisma.menuSection.update({
      where: { id },
      data: { name, position },
    });
    res.json(section);
  },
);

router.delete(
  '/sections/:id',
  doc({
    operationId: 'deleteMenuSection',
    summary: 'Delete a section',
    description: 'Its items stay in the menu, without a section.',
    responses: { 200: MessageResponse },
    errors: { 404: SECTION_NOT_FOUND },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
    // When a section is deleted, items will have their menuSectionId set to null (onDelete: SetNull)
    await prisma.menuSection.delete({
      where: { id: valid<typeof idRequest>(res).params.id },
    });
    res.json({ message: req.t('menuSections.deleted') });
  },
);

const reorderSchemas = { params: MenuIdParams, body: MenuSectionReorder };

router.post(
  '/menu/:menuId/sections/reorder',
  doc({
    operationId: 'reorderMenuSections',
    summary: 'Reorder the sections of a menu',
    description: '`sectionIds` lists every section of the menu, in its new order.',
    responses: { 200: MessageResponse },
    errors: {
      400: 'Invalid request, or the ids are not exactly the sections of the menu.',
      404: 'No menu has this id.',
    },
  }),
  validate(reorderSchemas),
  async (req: AuthRequest, res: Response) => {
    // sectionIds lists every section of the menu, in its new order
    const {
      params: { menuId },
      body: { sectionIds },
    } = valid<typeof reorderSchemas>(res);
    await prisma.$transaction((tx) => reorder(tx, 'menuSection', menuId, sectionIds));
    res.json({ message: req.t('menuSections.reordered') });
  },
);

export default router;
