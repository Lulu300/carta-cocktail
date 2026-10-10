import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError } from '../errors';

const router = Router();

// List sections for a menu
router.get('/menu/:menuId/sections', async (req: AuthRequest, res: Response) => {
  const sections = await prisma.menuSection.findMany({
    where: { menuId: parseInt(String(req.params.menuId)) },
    orderBy: { position: 'asc' },
  });
  res.json(sections);
});

// Create section
router.post('/menu/:menuId/sections', async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  const menuId = parseInt(String(req.params.menuId));

  if (!name) throw new BadRequestError();

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
router.put('/sections/:id', async (req: AuthRequest, res: Response) => {
  const { name, position } = req.body;
  const section = await prisma.menuSection.update({
    where: { id: parseInt(String(req.params.id)) },
    data: {
      ...(name !== undefined && { name }),
      ...(position !== undefined && { position }),
    },
  });
  res.json(section);
});

// Delete section
router.delete('/sections/:id', async (req: AuthRequest, res: Response) => {
  // When a section is deleted, items will have their menuSectionId set to null (onDelete: SetNull)
  await prisma.menuSection.delete({
    where: { id: parseInt(String(req.params.id)) },
  });
  res.json({ message: 'Section deleted' });
});

// Reorder sections
router.post('/menu/:menuId/sections/reorder', async (req: AuthRequest, res: Response) => {
  const { sectionIds } = req.body; // Array of section IDs in desired order
  const menuId = parseInt(String(req.params.menuId));

  if (!Array.isArray(sectionIds)) throw new BadRequestError();

  // Update positions
  await Promise.all(
    sectionIds.map((id: number, index: number) =>
      prisma.menuSection.update({
        where: { id, menuId },
        data: { position: index },
      })
    )
  );

  res.json({ message: 'Sections reordered' });
});

export default router;
