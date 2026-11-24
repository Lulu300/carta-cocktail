import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ConflictError, NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { CategoryTypeCreate, CategoryTypeParams, CategoryTypeUpdate } from '../validation/categoryTypes';

const router = Router();

// List all category types with usage count
router.get('/', async (_req: AuthRequest, res: Response) => {
  const types = await prisma.categoryType.findMany({
    include: { _count: { select: { categories: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(parseNameTranslations(types));
});

// Create a category type
const createSchemas = { body: CategoryTypeCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, nameTranslations, color } = valid<typeof createSchemas>(res).body;
  const typeName = name.toUpperCase();
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (existing) throw new ConflictError();
  const created = await prisma.categoryType.create({
    data: {
      name: typeName,
      nameTranslations: serializeTranslations(nameTranslations),
      color: color || 'gray',
    },
  });
  res.status(201).json(parseNameTranslations(created));
});

// Update a category type
const updateSchemas = { params: CategoryTypeParams, body: CategoryTypeUpdate };

router.put('/:name', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { name: typeName }, body: { nameTranslations, color } } = valid<typeof updateSchemas>(res);
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (!existing) throw new NotFoundError();
  const updated = await prisma.categoryType.update({
    where: { name: typeName },
    data: {
      nameTranslations: serializeTranslations(nameTranslations),
      ...(color !== undefined && { color }),
    },
  });
  res.json(parseNameTranslations(updated));
});

// Delete a category type
const deleteSchemas = { params: CategoryTypeParams };

router.delete('/:name', validate(deleteSchemas), async (req: AuthRequest, res: Response) => {
  const typeName = valid<typeof deleteSchemas>(res).params.name;
  const usageCount = await prisma.category.count({ where: { type: typeName } });
  if (usageCount > 0) throw new ConflictError('errors.typeInUse');
  await prisma.categoryType.delete({ where: { name: typeName } });
  res.json({ message: req.t('categoryTypes.deleted') });
});

export default router;
