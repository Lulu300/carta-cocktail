import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { CategoryTypeCreate, CategoryTypeParams, CategoryTypeUpdate } from '../validation/categoryTypes';

const router = Router();

// List all category types with usage count
router.get('/', async (_req: AuthRequest, res: Response) => {
  const types = await prisma.categoryType.findMany({
    orderBy: { name: 'asc' },
  });
  // Count categories per type
  const categories = await prisma.category.findMany({
    select: { type: true },
  });
  const countMap = new Map<string, number>();
  for (const c of categories) {
    countMap.set(c.type, (countMap.get(c.type) || 0) + 1);
  }
  const enriched = types.map(t => ({
    ...t,
    _count: { categories: countMap.get(t.name) || 0 },
  }));
  res.json(parseNameTranslations(enriched));
});

// Create a category type
const createSchemas = { body: CategoryTypeCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, nameTranslations, color } = valid<typeof createSchemas>(res).body;
  const typeName = name.toUpperCase();
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (existing) {
    res.status(409).json({ error: 'Type already exists' });
    return;
  }
  const created = await prisma.categoryType.create({
    data: {
      name: typeName,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
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
  if (!existing) {
    res.status(404).json({ error: 'Type not found' });
    return;
  }
  const updated = await prisma.categoryType.update({
    where: { name: typeName },
    data: {
      ...(nameTranslations !== undefined && {
        nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
      }),
      ...(color !== undefined && { color }),
    },
  });
  res.json(parseNameTranslations(updated));
});

// Delete a category type
const deleteSchemas = { params: CategoryTypeParams };

router.delete('/:name', validate(deleteSchemas), async (_req: AuthRequest, res: Response) => {
  const typeName = valid<typeof deleteSchemas>(res).params.name;
  const usageCount = await prisma.category.count({ where: { type: typeName } });
  if (usageCount > 0) {
    res.status(400).json({ error: 'Type is in use by categories' });
    return;
  }
  await prisma.categoryType.delete({ where: { name: typeName } });
  res.json({ message: 'Type deleted' });
});

export default router;
