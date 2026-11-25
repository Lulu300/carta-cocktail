import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ConflictError, NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { translationsToStore } from '../utils/storedNames';
import { valid, validate } from '../validation/validate';
import {
  CategoryTypeCreate, CategoryTypeParams, CategoryTypeQuery, CategoryTypeUpdate,
} from '../validation/categoryTypes';
import { requireNewCategoryTypeName } from '../services/categoryTypeService';

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
  // Upper case first: it can decompose a composed letter ('ΐ' becomes 'Ι\u0308\u0301')
  const typeName = requireNewCategoryTypeName(name.toUpperCase(), ['body', 'name']);
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (existing) throw new ConflictError();
  const created = await prisma.categoryType.create({
    data: {
      name: typeName,
      nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
      color: color || 'gray',
    },
  });
  res.status(201).json(parseNameTranslations(created));
});

type CategoryTypeChanges = z.output<typeof CategoryTypeUpdate>;

async function updateCategoryType(typeName: string, { nameTranslations, color }: CategoryTypeChanges) {
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (!existing) throw new NotFoundError();
  const updated = await prisma.categoryType.update({
    where: { name: typeName },
    data: {
      nameTranslations: serializeTranslations(translationsToStore(nameTranslations, existing.nameTranslations)),
      ...(color !== undefined && { color }),
    },
  });
  return parseNameTranslations(updated);
}

async function deleteCategoryType(typeName: string): Promise<void> {
  const usageCount = await prisma.category.count({ where: { type: typeName } });
  if (usageCount > 0) throw new ConflictError('errors.typeInUse');
  await prisma.categoryType.delete({ where: { name: typeName } });
}

// The type is named in the path (`/SPIRIT`), or in the query (`?name=`): data older than
// v1.9.0 can hold a type with an empty name, which a path segment cannot carry.

// Update a category type
const updateSchemas = { params: CategoryTypeParams, body: CategoryTypeUpdate };

router.put('/:name', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params, body } = valid<typeof updateSchemas>(res);
  res.json(await updateCategoryType(params.name, body));
});

const updateByQuerySchemas = { query: CategoryTypeQuery, body: CategoryTypeUpdate };

router.put('/', validate(updateByQuerySchemas), async (_req: AuthRequest, res: Response) => {
  const { query, body } = valid<typeof updateByQuerySchemas>(res);
  res.json(await updateCategoryType(query.name, body));
});

// Delete a category type
const deleteSchemas = { params: CategoryTypeParams };

router.delete('/:name', validate(deleteSchemas), async (req: AuthRequest, res: Response) => {
  await deleteCategoryType(valid<typeof deleteSchemas>(res).params.name);
  res.json({ message: req.t('categoryTypes.deleted') });
});

const deleteByQuerySchemas = { query: CategoryTypeQuery };

router.delete('/', validate(deleteByQuerySchemas), async (req: AuthRequest, res: Response) => {
  await deleteCategoryType(valid<typeof deleteByQuerySchemas>(res).query.name);
  res.json({ message: req.t('categoryTypes.deleted') });
});

export default router;
