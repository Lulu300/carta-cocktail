import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { deleteIngredient, isForceRequested } from '../services/deletionService';

const router = Router();

router.get('/', async (_req: AuthRequest, res: Response) => {
  const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
  res.json(parseNameTranslations(ingredients));
});

router.post('/bulk-availability', async (req: AuthRequest, res: Response) => {
  const { available } = req.body;
  if (typeof available !== 'boolean') throw new BadRequestError();
  const result = await prisma.ingredient.updateMany({
    data: { isAvailable: available },
  });
  res.json({ updated: result.count });
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: parseInt(String(req.params.id)) },
  });
  if (!ingredient) throw new NotFoundError();
  res.json(parseNameTranslations(ingredient));
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, icon, nameTranslations } = req.body;
  if (!name) throw new BadRequestError();
  const ingredient = await prisma.ingredient.create({
    data: {
      name,
      icon: icon || null,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(ingredient));
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
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
});

// Refused while recipes use the ingredient, unless ?force=true
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const impact = await deleteIngredient(parseInt(String(req.params.id)), isForceRequested(req.query.force));
  res.json({ message: req.t('ingredients.deleted'), deleted: true, impact });
});

export default router;
