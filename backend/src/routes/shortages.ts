import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        bottles: true,
      },
    });

    // Load category types for enrichment
    const categoryTypes = await prisma.categoryType.findMany();
    const typeMap = new Map(categoryTypes.map(ct => [ct.name, ct]));

    const shortages = categories
      .map((category) => {
        // Sum all remaining percentages (each bottle = max 100%)
        const totalPercent = category.bottles.reduce(
          (sum, b) => sum + b.remainingPercent, 0
        );
        const totalUsable = category.bottles.filter(
          (b) => b.remainingPercent > 0
        ).length;
        // Threshold: (desiredStock - 1) * 100 + minimumPercent
        const requiredPercent = (category.desiredStock - 1) * 100 + category.minimumPercent;

        return {
          category: parseNameTranslations({
            id: category.id,
            name: category.name,
            nameTranslations: category.nameTranslations,
            type: category.type,
            categoryType: typeMap.get(category.type) || null,
            desiredStock: category.desiredStock,
            minimumPercent: category.minimumPercent,
          }),
          totalPercent,
          requiredPercent,
          totalUsable,
          isShortage: totalPercent < requiredPercent,
        };
      })
      .filter((s) => s.isShortage);

    res.json(shortages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
