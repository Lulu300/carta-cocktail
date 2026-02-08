import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    res.json(parseNameTranslations(ingredients));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/bulk-availability', async (req: AuthRequest, res: Response) => {
  try {
    const { available } = req.body;
    if (typeof available !== 'boolean') {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const result = await prisma.ingredient.updateMany({
      data: { isAvailable: available },
    });
    res.json({ updated: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: parseInt(String(req.params.id)) },
    });
    if (!ingredient) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(parseNameTranslations(ingredient));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, nameTranslations } = req.body;
    if (!name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    const ingredient = await prisma.ingredient.create({
      data: {
        name,
        icon: icon || null,
        nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
      },
    });
    res.status(201).json(parseNameTranslations(ingredient));
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, isAvailable, nameTranslations } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
    if (nameTranslations !== undefined) updateData.nameTranslations = nameTranslations ? JSON.stringify(nameTranslations) : null;

    const ingredient = await prisma.ingredient.update({
      where: { id: parseInt(String(req.params.id)) },
      data: updateData,
    });
    res.json(parseNameTranslations(ingredient));
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.ingredient.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('ingredients.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.cannotDelete') });
  }
});

export default router;
