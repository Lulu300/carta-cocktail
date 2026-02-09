import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const prisma = new PrismaClient();

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

// List all categories
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { bottles: true } } },
      orderBy: { name: 'asc' },
    });
    const enriched = await enrichWithCategoryType(categories);
    res.json(parseNameTranslations(enriched));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get one category
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: { bottles: true },
    });
    if (!category) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    const [enriched] = await enrichWithCategoryType([category]);
    res.json(parseNameTranslations(enriched));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Create category
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, desiredStock, nameTranslations } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }
    await ensureCategoryType(type);
    const category = await prisma.category.create({
      data: {
        name,
        type,
        desiredStock: desiredStock || 1,
        nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
      },
    });
    res.status(201).json(parseNameTranslations(category));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update category
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, desiredStock, nameTranslations } = req.body;
    if (type) {
      await ensureCategoryType(type);
    }
    const category = await prisma.category.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(desiredStock !== undefined && { desiredStock }),
        ...(nameTranslations !== undefined && { nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null }),
      },
    });
    res.json(parseNameTranslations(category));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Delete category
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.category.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('categories.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.cannotDelete') });
  }
});

export default router;
