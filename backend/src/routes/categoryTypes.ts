import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const prisma = new PrismaClient();

// List all category types with usage count
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a category type
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, nameTranslations, color } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const typeName = name.trim().toUpperCase();
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a category type
router.put('/:name', async (req: AuthRequest, res: Response) => {
  try {
    const typeName = String(req.params.name);
    const { nameTranslations, color } = req.body;
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a category type
router.delete('/:name', async (req: AuthRequest, res: Response) => {
  try {
    const typeName = String(req.params.name);
    const usageCount = await prisma.category.count({ where: { type: typeName } });
    if (usageCount > 0) {
      res.status(400).json({ error: 'Type is in use by categories' });
      return;
    }
    await prisma.categoryType.delete({ where: { name: typeName } });
    res.json({ message: 'Type deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
