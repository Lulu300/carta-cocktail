import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// List sections for a menu
router.get('/menu/:menuId/sections', async (req: AuthRequest, res: Response) => {
  try {
    const sections = await prisma.menuSection.findMany({
      where: { menuId: parseInt(String(req.params.menuId)) },
      orderBy: { position: 'asc' },
    });
    res.json(sections);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Create section
router.post('/menu/:menuId/sections', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const menuId = parseInt(String(req.params.menuId));

    if (!name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update section
router.put('/sections/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, position } = req.body;
    const section = await prisma.menuSection.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name !== undefined && { name }),
        ...(position !== undefined && { position }),
      },
    });
    res.json(section);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Delete section
router.delete('/sections/:id', async (req: AuthRequest, res: Response) => {
  try {
    // When a section is deleted, items will have their menuSectionId set to null (onDelete: SetNull)
    await prisma.menuSection.delete({
      where: { id: parseInt(String(req.params.id)) },
    });
    res.json({ message: 'Section deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Reorder sections
router.post('/menu/:menuId/sections/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const { sectionIds } = req.body; // Array of section IDs in desired order
    const menuId = parseInt(String(req.params.menuId));

    if (!Array.isArray(sectionIds)) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
