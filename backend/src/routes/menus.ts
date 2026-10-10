import { Router, Response } from 'express';
import { Menu, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';

const router = Router();

// Menus created by the seed and kept in sync with the bottles' apero/digestif flags.
// Their slug and type are what the sync and the delete protection rely on.
const SYSTEM_MENU_SLUGS = ['aperitifs', 'digestifs'];

interface MenuItemInput {
  position?: number;
  isHidden?: boolean;
  menuSectionId?: number | null;
}

interface MenuCocktailInput extends MenuItemInput {
  cocktailId: number;
}

interface MenuBottleInput extends MenuItemInput {
  bottleId: number;
}

function isSystemMenu(menu: Pick<Menu, 'slug'>): boolean {
  return SYSTEM_MENU_SLUGS.includes(menu.slug);
}

function normalizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// Sending back the current slug or type is allowed, so a form that posts every field still works.
function changesSystemMenuIdentity(menu: Pick<Menu, 'slug' | 'type'>, slug?: string, type?: string): boolean {
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

// List all menus
router.get('/', async (_req: AuthRequest, res: Response) => {
  const menus = await prisma.menu.findMany({
    include: { _count: { select: { cocktails: true, bottles: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(menus);
});

// Get one menu with cocktails and bottles
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const menu = await prisma.menu.findUnique({
    where: { id: parseInt(String(req.params.id)) },
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
  res.json(menu);
});

// Create menu
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description, slug, isPublic, type } = req.body;
  if (!name || !slug) throw new BadRequestError();
  const menu = await prisma.menu.create({
    data: {
      name,
      description: description || null,
      slug: normalizeSlug(slug),
      isPublic: isPublic ?? false,
      type: type || 'COCKTAILS',
    },
  });
  res.status(201).json(menu);
});

// Update menu (info and, when provided, the full list of cocktails / bottles)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const menuId = parseInt(String(req.params.id));
  const { name, description, slug, isPublic, type } = req.body;
  const cocktails: MenuCocktailInput[] | undefined = req.body.cocktails;
  const bottles: MenuBottleInput[] | undefined = req.body.bottles;

  const existing = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!existing) throw new NotFoundError();

  if (isSystemMenu(existing) && changesSystemMenuIdentity(existing, slug, type)) {
    throw new ForbiddenError('errors.cannotModifySystemMenu');
  }

  // One transaction: a failure at any step (foreign section, duplicate slug...)
  // must leave the existing associations untouched.
  const menu = await prisma.$transaction(async (tx) => {
    await assertSectionsBelongToMenu(tx, menuId, [...(cocktails ?? []), ...(bottles ?? [])]);

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
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(slug && { slug: normalizeSlug(slug) }),
        ...(isPublic !== undefined && { isPublic }),
        ...(type && { type }),
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
  res.json(menu);
});

// Delete menu (prevent deletion of default apero/digestif menus)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const menu = await prisma.menu.findUnique({
    where: { id: parseInt(String(req.params.id)) },
  });

  if (!menu) throw new NotFoundError();

  if (isSystemMenu(menu)) throw new ForbiddenError('errors.cannotDeleteDefaultMenu');

  await prisma.menu.delete({ where: { id: parseInt(String(req.params.id)) } });
  res.json({ message: req.t('menus.deleted') });
});

export default router;
