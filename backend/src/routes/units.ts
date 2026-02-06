import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(units);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id: parseInt(String(req.params.id)) },
    });
    if (!unit) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, abbreviation } = req.body;
    if (!name || !abbreviation) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const unit = await prisma.unit.create({ data: { name, abbreviation } });
    res.status(201).json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, abbreviation } = req.body;
    const unit = await prisma.unit.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name && { name }),
        ...(abbreviation && { abbreviation }),
      },
    });
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.unit.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('units.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.cannotDelete') });
  }
});

export default router;
