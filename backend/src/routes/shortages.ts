import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';
import { apiDocs } from '../openapi/routeDoc';
import { Shortage } from '../validation/categories';

const router = Router();
const doc = apiDocs('Shortages');

router.get(
  '/',
  doc({
    operationId: 'listShortages',
    summary: 'List the categories below their desired stock',
    responses: { 200: z.array(Shortage) },
  }),
  async (_req: AuthRequest, res: Response) => {
    const categories = await prisma.category.findMany({
      include: {
        bottles: { select: { remainingPercent: true } },
        categoryType: true,
      },
    });

    const shortages = categories
      .map((category) => {
        // Sum all remaining percentages (each bottle = max 100%)
        const totalPercent = category.bottles.reduce((sum, b) => sum + b.remainingPercent, 0);
        const totalUsable = category.bottles.filter((b) => b.remainingPercent > 0).length;
        // Threshold: (desiredStock - 1) * 100 + minimumPercent
        const requiredPercent = (category.desiredStock - 1) * 100 + category.minimumPercent;

        return {
          category: parseNameTranslations({
            id: category.id,
            name: category.name,
            nameTranslations: category.nameTranslations,
            type: category.type,
            categoryType: category.categoryType,
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
  },
);

export default router;
