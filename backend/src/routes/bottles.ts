import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { parseNameTranslations } from '../utils/translations';
import { buildExportPayload, buildCsvPayload } from '../utils/bottlesExport';
import { parseImportFile, NormalizedImportPayload } from '../utils/bottlesImport';

const router = Router();
const prisma = new PrismaClient();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helper function to auto-sync bottle menus when bottle flags change
async function syncBottleMenus(bottleId: number, isApero: boolean, isDigestif: boolean) {
  // Fetch bottle to check if empty
  const bottle = await prisma.bottle.findUnique({ where: { id: bottleId }, select: { remainingPercent: true } });
  const isEmpty = !bottle || bottle.remainingPercent === 0;

  // Get apero and digestif menus
  const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
  const digestifMenu = await prisma.menu.findUnique({ where: { slug: 'digestifs' } });

  // Sync apero menu
  if (aperoMenu) {
    const existsInApero = await prisma.menuBottle.findFirst({
      where: { menuId: aperoMenu.id, bottleId },
    });

    if (isApero && !existsInApero && !isEmpty) {
      // Add to apero menu (only non-empty bottles)
      const maxPosition = await prisma.menuBottle.findFirst({
        where: { menuId: aperoMenu.id },
        orderBy: { position: 'desc' },
      });
      await prisma.menuBottle.create({
        data: {
          menuId: aperoMenu.id,
          bottleId,
          position: (maxPosition?.position ?? -1) + 1,
          isHidden: false,
        },
      });
    } else if ((!isApero || isEmpty) && existsInApero) {
      // Remove from apero menu
      await prisma.menuBottle.delete({ where: { id: existsInApero.id } });
    }
  }

  // Sync digestif menu
  if (digestifMenu) {
    const existsInDigestif = await prisma.menuBottle.findFirst({
      where: { menuId: digestifMenu.id, bottleId },
    });

    if (isDigestif && !existsInDigestif && !isEmpty) {
      // Add to digestif menu (only non-empty bottles)
      const maxPosition = await prisma.menuBottle.findFirst({
        where: { menuId: digestifMenu.id },
        orderBy: { position: 'desc' },
      });
      await prisma.menuBottle.create({
        data: {
          menuId: digestifMenu.id,
          bottleId,
          position: (maxPosition?.position ?? -1) + 1,
          isHidden: false,
        },
      });
    } else if ((!isDigestif || isEmpty) && existsInDigestif) {
      // Remove from digestif menu
      await prisma.menuBottle.delete({ where: { id: existsInDigestif.id } });
    }
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, type } = req.query;
    const where: any = {};
    if (categoryId) where.categoryId = parseInt(categoryId as string);
    if (type) where.category = { type: type as string };

    const bottles = await prisma.bottle.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(parseNameTranslations(bottles));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/import/preview', importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    let payload: NormalizedImportPayload;
    try {
      payload = parseImportFile(req.file.originalname || '', req.file.buffer);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Invalid file' });
      return;
    }

    const allCategories = await prisma.category.findMany();
    const allBottles = await prisma.bottle.findMany({ include: { category: true } });

    const categories = payload.categories.map((c) => {
      const match = allCategories.find(
        (ac) => ac.name.toLowerCase() === c.name.toLowerCase()
      );
      return {
        ref: c,
        existingMatch: match
          ? { id: match.id, name: match.name, type: match.type, desiredStock: match.desiredStock }
          : null,
        status: match ? ('matched' as const) : ('missing' as const),
      };
    });

    const bottles = payload.bottles.map((b) => {
      const duplicates = allBottles
        .filter((eb) =>
          eb.name.toLowerCase() === b.name.toLowerCase() &&
          eb.capacityMl === b.capacityMl &&
          eb.category.name.toLowerCase() === b.categoryName.toLowerCase()
        )
        .map((d) => ({
          id: d.id,
          name: d.name,
          capacityMl: d.capacityMl,
          categoryName: d.category.name,
          remainingPercent: d.remainingPercent,
        }));
      return {
        ref: b,
        needsCategory: b.categoryName.length === 0,
        potentialDuplicates: duplicates,
      };
    });

    res.json({ payload, categories, bottles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/import/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { payload, resolutions } = req.body as {
      payload: NormalizedImportPayload;
      resolutions?: {
        categories?: Record<string, { action: 'use_existing' | 'create'; existingId?: number; data?: any }>;
        bottles?: Record<string, { action: 'import' | 'skip'; categoryName?: string }>;
      };
    };

    if (!payload || payload.version !== 1 || !Array.isArray(payload.bottles)) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const categoryMap = new Map<string, number>(); // lowercased name -> id

      // Seed map with already-existing categories matching any reference
      const allCats = await tx.category.findMany();
      for (const c of allCats) categoryMap.set(c.name.toLowerCase(), c.id);

      // Apply explicit category resolutions
      for (const [key, resolution] of Object.entries(resolutions?.categories || {})) {
        if (resolution.action === 'use_existing' && resolution.existingId) {
          categoryMap.set(key.toLowerCase(), resolution.existingId);
        } else if (resolution.action === 'create' && resolution.data) {
          const typeValue = resolution.data.type || 'SPIRIT';
          const existingType = await tx.categoryType.findUnique({ where: { name: typeValue } });
          if (!existingType) {
            await tx.categoryType.create({ data: { name: typeValue, color: 'gray' } });
          }
          const { nameTranslations, name, type, desiredStock, minimumPercent } = resolution.data;
          const createdCat = await tx.category.create({
            data: {
              name: name || key,
              type: type || 'SPIRIT',
              desiredStock: typeof desiredStock === 'number' ? desiredStock : 1,
              minimumPercent: typeof minimumPercent === 'number' ? minimumPercent : 30,
              nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
            },
          });
          categoryMap.set((name || key).toLowerCase(), createdCat.id);
        }
      }

      const createdBottleRefs: { id: number; isApero: boolean; isDigestif: boolean }[] = [];
      let createdCount = 0;
      let skippedNoCategory = 0;
      let duplicatesCreated = 0;

      const bottleResolutions = resolutions?.bottles || {};

      const existingDuplicateKey = (name: string, capacityMl: number, categoryName: string) =>
        `${name.toLowerCase()}|${capacityMl}|${categoryName.toLowerCase()}`;
      const existingBottles = await tx.bottle.findMany({ include: { category: true } });
      const existingKeys = new Set(
        existingBottles.map((b) => existingDuplicateKey(b.name, b.capacityMl, b.category.name))
      );

      for (let i = 0; i < payload.bottles.length; i++) {
        const b = payload.bottles[i];
        const resolution = bottleResolutions[String(i)] ?? { action: 'import' as const };

        if (resolution.action === 'skip') continue;

        const finalCategoryName = (resolution.categoryName || b.categoryName).trim();
        if (!finalCategoryName) {
          skippedNoCategory++;
          continue;
        }
        const categoryId = categoryMap.get(finalCategoryName.toLowerCase());
        if (!categoryId) {
          skippedNoCategory++;
          continue;
        }

        const isDuplicate = existingKeys.has(
          existingDuplicateKey(b.name, b.capacityMl, finalCategoryName)
        );

        const quantity = Math.max(1, Math.min(50, b.quantity || 1));
        for (let q = 0; q < quantity; q++) {
          const newBottle = await tx.bottle.create({
            data: {
              name: b.name,
              categoryId,
              capacityMl: b.capacityMl,
              remainingPercent: b.remainingPercent ?? 100,
              alcoholPercentage: b.alcoholPercentage,
              purchasePrice: b.purchasePrice,
              location: b.location,
              openedAt: b.openedAt ? new Date(b.openedAt) : null,
              isApero: b.isApero,
              isDigestif: b.isDigestif,
            },
          });
          createdBottleRefs.push({
            id: newBottle.id,
            isApero: newBottle.isApero,
            isDigestif: newBottle.isDigestif,
          });
          createdCount++;
          if (isDuplicate) duplicatesCreated++;
        }
      }

      return { createdBottleRefs, createdCount, skippedNoCategory, duplicatesCreated };
    });

    // Sync menus after the transaction commits so bottles are visible
    for (const ref of created.createdBottleRefs) {
      if (ref.isApero || ref.isDigestif) {
        await syncBottleMenus(ref.id, ref.isApero, ref.isDigestif);
      }
    }

    res.status(201).json({
      created: { bottles: created.createdCount },
      duplicatesCreated: created.duplicatesCreated,
      skippedNoCategory: created.skippedNoCategory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, type, location, search, format } = req.query;
    const fmt = (typeof format === 'string' ? format : 'json').toLowerCase();
    if (fmt !== 'json' && fmt !== 'csv') {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const where: any = {};
    if (categoryId) where.categoryId = parseInt(String(categoryId));
    if (type) where.category = { type: String(type) };
    if (location) where.location = { contains: String(location) };
    if (search) where.name = { contains: String(search) };

    const bottles = await prisma.bottle.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const date = new Date().toISOString().slice(0, 10);

    if (fmt === 'csv') {
      const csv = buildCsvPayload(bottles);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bottles-${date}.csv"`);
      res.send(csv);
      return;
    }

    const payload = buildExportPayload(bottles);
    res.setHeader('Content-Disposition', `attachment; filename="bottles-${date}.json"`);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const bottle = await prisma.bottle.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: { category: true },
    });
    if (!bottle) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(parseNameTranslations(bottle));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, categoryId, purchasePrice, capacityMl, remainingPercent, openedAt, alcoholPercentage, location, isApero, isDigestif, quantity } = req.body;
    if (!name || !categoryId || !capacityMl) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const count = Math.min(Math.max(1, parseInt(quantity) || 1), 50);
    const data = {
      name,
      categoryId,
      purchasePrice: purchasePrice || null,
      capacityMl,
      remainingPercent: remainingPercent ?? 100,
      openedAt: openedAt ? new Date(openedAt) : null,
      alcoholPercentage: alcoholPercentage || null,
      location: location || null,
      isApero: isApero ?? false,
      isDigestif: isDigestif ?? false,
    };

    if (count === 1) {
      const bottle = await prisma.bottle.create({ data, include: { category: true } });
      await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);
      res.status(201).json(parseNameTranslations(bottle));
    } else {
      const bottles = [];
      for (let i = 0; i < count; i++) {
        const bottle = await prisma.bottle.create({ data, include: { category: true } });
        await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);
        bottles.push(bottle);
      }
      res.status(201).json(parseNameTranslations(bottles));
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, categoryId, purchasePrice, capacityMl, remainingPercent, openedAt, alcoholPercentage, location, isApero, isDigestif } = req.body;
    const bottle = await prisma.bottle.update({
      where: { id: parseInt(String(req.params.id)) },
      data: {
        ...(name && { name }),
        ...(categoryId && { categoryId }),
        ...(purchasePrice !== undefined && { purchasePrice }),
        ...(capacityMl && { capacityMl }),
        ...(remainingPercent !== undefined && { remainingPercent }),
        ...(openedAt !== undefined && { openedAt: openedAt ? new Date(openedAt) : null }),
        ...(alcoholPercentage !== undefined && { alcoholPercentage }),
        ...(location !== undefined && { location: location || null }),
        ...(isApero !== undefined && { isApero }),
        ...(isDigestif !== undefined && { isDigestif }),
      },
      include: { category: true },
    });

    // Auto-sync bottle menus if flags changed
    if (isApero !== undefined || isDigestif !== undefined) {
      await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);
    }

    res.json(parseNameTranslations(bottle));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.bottle.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('bottles.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.cannotDelete') });
  }
});

export default router;
