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

    const shortages = categories
      .map((category) => {
        // Count sealed (unopened) bottles with remaining > 0
        const sealedCount = category.bottles.filter(
          (b) => !b.openedAt && b.remainingPercent > 0
        ).length;
        const totalUsable = category.bottles.filter(
          (b) => b.remainingPercent > 0
        ).length;

        return {
          category: parseNameTranslations({
            id: category.id,
            name: category.name,
            nameTranslations: category.nameTranslations,
            type: category.type,
            desiredStock: category.desiredStock,
          }),
          sealedCount,
          totalUsable,
          deficit: Math.max(0, category.desiredStock - sealedCount),
          isShortage: sealedCount < category.desiredStock,
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
