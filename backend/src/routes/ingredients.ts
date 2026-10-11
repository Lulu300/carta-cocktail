import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { deleteIngredient, isForceRequested } from '../services/deletionService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, IdParams, idRequest } from '../validation/common';
import { BulkAvailability, IngredientCreate, IngredientUpdate } from '../validation/ingredients';

const router = Router();

router.get('/', async (_req: AuthRequest, res: Response) => {
  const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
  res.json(parseNameTranslations(ingredients));
});

const bulkSchemas = { body: BulkAvailability };

router.post('/bulk-availability', validate(bulkSchemas), async (_req: AuthRequest, res: Response) => {
  const { available } = valid<typeof bulkSchemas>(res).body;
  const result = await prisma.ingredient.updateMany({
    data: { isAvailable: available },
  });
  res.json({ updated: result.count });
});

router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: valid<typeof idRequest>(res).params.id },
  });
  if (!ingredient) throw new NotFoundError();
  res.json(parseNameTranslations(ingredient));
});

const createSchemas = { body: IngredientCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, icon, nameTranslations } = valid<typeof createSchemas>(res).body;
  const ingredient = await prisma.ingredient.create({
    data: {
      name,
      icon: icon || null,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(ingredient));
});

const updateSchemas = { params: IdParams, body: IngredientUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { name, icon, isAvailable, nameTranslations } = body;
  // Absent fields are undefined, which Prisma leaves untouched
  const ingredient = await prisma.ingredient.update({
    where: { id },
    data: {
      name,
      icon,
      isAvailable,
      ...(nameTranslations !== undefined && {
        nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
      }),
    },
  });
  res.json(parseNameTranslations(ingredient));
});

// Refused while recipes use the ingredient, unless ?force=true
router.delete('/:id', validate(deleteRequest), async (req: AuthRequest, res: Response) => {
  const { params: { id }, query } = valid<typeof deleteRequest>(res);
  const impact = await deleteIngredient(id, isForceRequested(query.force));
  res.json({ message: req.t('ingredients.deleted'), deleted: true, impact });
});

export default router;
