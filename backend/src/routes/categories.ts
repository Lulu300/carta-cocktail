import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { assertUniqueIgnoringCase } from '../utils/uniqueness';
import { deleteCategory, isForceRequested } from '../services/deletionService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, IdParams, idRequest } from '../validation/common';
import { CategoryCreate, CategoryUpdate } from '../validation/categories';

const router = Router();

// Helper: enrich categories with their CategoryType metadata
async function enrichWithCategoryType(categories: any[]) {
  const categoryTypes = await prisma.categoryType.findMany();
  const typeMap = new Map(categoryTypes.map(ct => [ct.name, ct]));
  return categories.map(c => ({
    ...c,
    categoryType: typeMap.get(c.type) || null,
  }));
}

// Helper: auto-create CategoryType if it doesn't exist
async function ensureCategoryType(type: string) {
  const existing = await prisma.categoryType.findUnique({ where: { name: type } });
  if (!existing) {
    await prisma.categoryType.create({ data: { name: type, color: 'gray' } });
  }
}

async function assertCategoryNameIsFree(name: string, ownId?: number) {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  assertUniqueIgnoringCase(categories.map((c) => ({ id: c.id, value: c.name })), name, ownId);
}

// List all categories
router.get('/', async (_req: AuthRequest, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { bottles: true } } },
    orderBy: { name: 'asc' },
  });
  const enriched = await enrichWithCategoryType(categories);
  res.json(parseNameTranslations(enriched));
});

// Get one category
router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const category = await prisma.category.findUnique({
    where: { id: valid<typeof idRequest>(res).params.id },
    include: { bottles: true },
  });
  if (!category) throw new NotFoundError();
  const [enriched] = await enrichWithCategoryType([category]);
  res.json(parseNameTranslations(enriched));
});

// Create category
const createSchemas = { body: CategoryCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, type, desiredStock, minimumPercent, nameTranslations } = valid<typeof createSchemas>(res).body;
  await assertCategoryNameIsFree(name);
  await ensureCategoryType(type);
  const category = await prisma.category.create({
    data: {
      name,
      type,
      // ?? and not ||: a desired stock of 0 is kept
      desiredStock: desiredStock ?? 1,
      minimumPercent: minimumPercent ?? 30,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(category));
});

// Update category
const updateSchemas = { params: IdParams, body: CategoryUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { name, type, desiredStock, minimumPercent, nameTranslations } = body;
  if (name !== undefined) {
    await assertCategoryNameIsFree(name, id);
  }
  if (type !== undefined) {
    await ensureCategoryType(type);
  }
  // Absent fields are undefined, which Prisma leaves untouched
  const category = await prisma.category.update({
    where: { id },
    data: {
      name,
      type,
      desiredStock,
      minimumPercent,
      ...(nameTranslations !== undefined && { nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null }),
    },
  });
  res.json(parseNameTranslations(category));
});

// Delete category: refused while it holds bottles or recipes use it, unless ?force=true
router.delete('/:id', validate(deleteRequest), async (req: AuthRequest, res: Response) => {
  const { params: { id }, query } = valid<typeof deleteRequest>(res);
  const impact = await deleteCategory(id, isForceRequested(query.force));
  res.json({ message: req.t('categories.deleted'), deleted: true, impact });
});

export default router;
