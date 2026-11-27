import { Router, Response } from 'express';
import { z } from 'zod';
import { Menu, Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MessageResponse } from '../validation/common';
import {
  MenuCreate,
  MenuDetail,
  MenuRow,
  MenuSummary,
  MenuUpdate,
  UpdatedMenu,
} from '../validation/menus';
import { apiDocs } from '../openapi/routeDoc';
import {
  assertBottlesAllowed,
  assertCocktailsAllowed,
  isSystemMenu,
} from '../services/menuSyncService';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const doc = apiDocs('Menus');

const NOT_FOUND = 'No menu has this id.';

interface MenuItemInput {
  menuSectionId?: number | null;
}

function normalizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// Sending back the current slug or type is allowed, so a form that posts every field still works.
function changesSystemMenuIdentity(
  menu: Pick<Menu, 'slug' | 'type'>,
  slug?: string,
  type?: string,
): boolean {
  const slugChanged = !!slug && normalizeSlug(slug) !== menu.slug;
  const typeChanged = !!type && type !== menu.type;
  return slugChanged || typeChanged;
}

async function assertSectionsBelongToMenu(
  tx: Prisma.TransactionClient,
  menuId: number,
  items: MenuItemInput[],
): Promise<void> {
  const sectionIds = items
    .map((item) => item.menuSectionId)
    .filter((id): id is number => id != null);
  const uniqueIds = [...new Set(sectionIds)];
  if (uniqueIds.length === 0) return;

  const owned = await tx.menuSection.count({ where: { id: { in: uniqueIds }, menuId } });
  // Thrown inside the transaction, so it also rolls it back
  if (owned !== uniqueIds.length) throw new BadRequestError();
}

router.get(
  '/',
  doc({
    operationId: 'listMenus',
    summary: 'List the menus',
    description: 'With their number of cocktails and bottles.',
    responses: { 200: z.array(MenuSummary) },
  }),
  async (_req: AuthRequest, res: Response) => {
    const menus = await prisma.menu.findMany({
      include: { _count: { select: { cocktails: true, bottles: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(menus);
  },
);

router.get(
  '/:id',
  doc({
    operationId: 'getMenu',
    summary: 'Get a menu',
    description: 'With its sections, cocktails and bottles, hidden ones included.',
    responses: { 200: MenuDetail },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const menu = await prisma.menu.findUnique({
      where: { id: valid<typeof idRequest>(res).params.id },
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
    if (!menu) throw new NotFoundError();
    res.json(parseNameTranslations(menu));
  },
);

const createSchemas = { body: MenuCreate };

router.post(
  '/',
  doc({
    operationId: 'createMenu',
    summary: 'Create a menu',
    responses: { 201: MenuRow },
    errors: { 409: 'Another menu has this slug.' },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { name, description, slug, isPublic, type } = valid<typeof createSchemas>(res).body;
    const menu = await prisma.menu.create({
      data: {
        name,
        description: description || null,
        slug: normalizeSlug(slug),
        isPublic: isPublic ?? false,
        type: type ?? 'COCKTAILS',
      },
    });
    res.status(201).json(menu);
  },
);

const updateSchemas = { params: IdParams, body: MenuUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateMenu',
    summary: 'Update a menu',
    description:
      'Only the fields present in the body change. A list of cocktails or bottles replaces the whole composition of the menu.',
    responses: { 200: UpdatedMenu },
    errors: {
      400: 'Invalid request, an item the menu type does not allow, a section of another menu, a new type, or bottles sent to a system menu.',
      403: 'The slug or the type of a system menu cannot change.',
      404: NOT_FOUND,
      409: 'Another menu has this slug.',
    },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id: menuId },
      body,
    } = valid<typeof updateSchemas>(res);
    const { name, description, slug, isPublic, type, cocktails, bottles } = body;

    const existing = await prisma.menu.findUnique({ where: { id: menuId } });
    if (!existing) throw new NotFoundError();

    if (isSystemMenu(existing)) {
      if (changesSystemMenuIdentity(existing, slug, type))
        throw new ForbiddenError('errors.cannotModifySystemMenu');
      // Its bottles follow their flags: removing one goes through an exclusion
      if (bottles) throw new BadRequestError('errors.systemMenuBottlesManaged');
    } else if (type && type !== existing.type) {
      // Another type would leave cocktails in a bottle menu, or bottles not checked for the new type
      throw new BadRequestError('errors.menuTypeImmutable');
    }

    // One transaction: a failure at any step (foreign section, duplicate slug...)
    // must leave the existing associations untouched.
    const menu = await prisma.$transaction(async (tx) => {
      await assertSectionsBelongToMenu(tx, menuId, [...(cocktails ?? []), ...(bottles ?? [])]);
      if (cocktails) assertCocktailsAllowed(existing, cocktails);
      if (bottles)
        await assertBottlesAllowed(
          tx,
          existing,
          bottles.map((b) => b.bottleId),
        );

      if (cocktails) {
        await tx.menuCocktail.deleteMany({ where: { menuId } });
        await tx.menuCocktail.createMany({
          data: cocktails.map((c, index) => ({
            menuId,
            cocktailId: c.cocktailId,
            menuSectionId: c.menuSectionId ?? null,
            position: c.position ?? index,
            isHidden: c.isHidden ?? false,
          })),
        });
      }

      if (bottles) {
        await tx.menuBottle.deleteMany({ where: { menuId } });
        await tx.menuBottle.createMany({
          data: bottles.map((b, index) => ({
            menuId,
            bottleId: b.bottleId,
            menuSectionId: b.menuSectionId ?? null,
            position: b.position ?? index,
            isHidden: b.isHidden ?? false,
          })),
        });
      }

      return tx.menu.update({
        where: { id: menuId },
        // Absent fields are undefined, which Prisma leaves untouched
        data: {
          name,
          description,
          slug: slug === undefined ? undefined : normalizeSlug(slug),
          isPublic,
          type,
        },
        include: {
          cocktails: {
            include: { cocktail: true },
            orderBy: { position: 'asc' },
          },
          bottles: {
            include: { bottle: { include: { category: true } } },
            orderBy: { position: 'asc' },
          },
        },
      });
    });
    res.json(parseNameTranslations(menu));
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'deleteMenu',
    summary: 'Delete a menu',
    responses: { 200: MessageResponse },
    errors: { 403: 'The aperitif and digestif menus cannot be deleted.', 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
    const { id } = valid<typeof idRequest>(res).params;
    const menu = await prisma.menu.findUnique({ where: { id } });

    if (!menu) throw new NotFoundError();

    if (isSystemMenu(menu)) throw new ForbiddenError('errors.cannotDeleteDefaultMenu');

    await prisma.menu.delete({ where: { id } });
    res.json({ message: req.t('menus.deleted') });
  },
);

export default router;
