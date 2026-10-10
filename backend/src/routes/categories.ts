import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { assertUniqueIgnoringCase } from '../utils/uniqueness';
import { deleteCategory, isForceRequested } from '../services/deletionService';

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
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const category = await prisma.category.findUnique({
    where: { id: parseInt(String(req.params.id)) },
    include: { bottles: true },
  });
  if (!category) throw new NotFoundError();
  const [enriched] = await enrichWithCategoryType([category]);
  res.json(parseNameTranslations(enriched));
});

// Create category
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, type, desiredStock, minimumPercent, nameTranslations } = req.body;
  if (!name || !type) throw new BadRequestError();
  await assertCategoryNameIsFree(name);
  await ensureCategoryType(type);
  const category = await prisma.category.create({
    data: {
      name,
      type,
      desiredStock: desiredStock || 1,
      minimumPercent: minimumPercent !== undefined ? minimumPercent : 30,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(category));
});

// Update category
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, type, desiredStock, minimumPercent, nameTranslations } = req.body;
  const id = parseInt(String(req.params.id));
  if (name) {
    await assertCategoryNameIsFree(name, id);
  }
  if (type) {
    await ensureCategoryType(type);
  }
  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(type && { type }),
      ...(desiredStock !== undefined && { desiredStock }),
      ...(minimumPercent !== undefined && { minimumPercent }),
      ...(nameTranslations !== undefined && { nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null }),
    },
  });
  res.json(parseNameTranslations(category));
});

// Delete category: refused while it holds bottles or recipes use it, unless ?force=true
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const impact = await deleteCategory(parseInt(String(req.params.id)), isForceRequested(req.query.force));
  res.json({ message: req.t('categories.deleted'), deleted: true, impact });
});

export default router;
