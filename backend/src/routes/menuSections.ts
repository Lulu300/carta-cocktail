import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MenuIdParams } from '../validation/common';
import { MenuSectionCreate, MenuSectionReorder, MenuSectionUpdate } from '../validation/menuSections';

const router = Router();

// List sections for a menu
const menuSchemas = { params: MenuIdParams };

router.get('/menu/:menuId/sections', validate(menuSchemas), async (_req: AuthRequest, res: Response) => {
  const sections = await prisma.menuSection.findMany({
    where: { menuId: valid<typeof menuSchemas>(res).params.menuId },
    orderBy: { position: 'asc' },
  });
  res.json(sections);
});

// Create section
const createSchemas = { params: MenuIdParams, body: MenuSectionCreate };

router.post('/menu/:menuId/sections', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { menuId }, body: { name } } = valid<typeof createSchemas>(res);

  // Get max position for this menu
  const maxSection = await prisma.menuSection.findFirst({
    where: { menuId },
    orderBy: { position: 'desc' },
  });

  const section = await prisma.menuSection.create({
    data: {
      menuId,
      name,
      position: (maxSection?.position ?? -1) + 1,
    },
  });

  res.status(201).json(section);
});

// Update section
const updateSchemas = { params: IdParams, body: MenuSectionUpdate };

router.put('/sections/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body: { name, position } } = valid<typeof updateSchemas>(res);
  // Absent fields are undefined, which Prisma leaves untouched
  const section = await prisma.menuSection.update({
    where: { id },
    data: { name, position },
  });
  res.json(section);
});

// Delete section
router.delete('/sections/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  // When a section is deleted, items will have their menuSectionId set to null (onDelete: SetNull)
  await prisma.menuSection.delete({
    where: { id: valid<typeof idRequest>(res).params.id },
  });
  res.json({ message: 'Section deleted' });
});

// Reorder sections
const reorderSchemas = { params: MenuIdParams, body: MenuSectionReorder };

router.post('/menu/:menuId/sections/reorder', validate(reorderSchemas), async (_req: AuthRequest, res: Response) => {
  // sectionIds lists the menu's sections in their new order
  const { params: { menuId }, body: { sectionIds } } = valid<typeof reorderSchemas>(res);

  await Promise.all(
    sectionIds.map((id, index) =>
      prisma.menuSection.update({
        where: { id, menuId },
        data: { position: index },
      })
    )
  );

  res.json({ message: 'Sections reordered' });
});

export default router;
