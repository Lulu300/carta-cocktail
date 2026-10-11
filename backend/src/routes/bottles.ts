import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { buildExportPayload, buildCsvPayload } from '../utils/bottlesExport';
import { parseImportFile, NormalizedImportPayload } from '../utils/bottlesImport';
import { deleteBottle, isForceRequested } from '../services/deletionService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, IdParams, idRequest } from '../validation/common';
import { BottleCreate, BottleExportQuery, BottleListQuery, BottleUpdate } from '../validation/bottles';
import { BottleImportConfirm } from '../validation/bottleImport';

const router = Router();

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

const listSchemas = { query: BottleListQuery };

router.get('/', validate(listSchemas), async (_req: AuthRequest, res: Response) => {
  const { categoryId, type } = valid<typeof listSchemas>(res).query;
  const where: Prisma.BottleWhereInput = {};
  if (categoryId) where.categoryId = categoryId;
  if (type) where.category = { type };

  const bottles = await prisma.bottle.findMany({
    where,
    include: { category: true },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });
  res.json(parseNameTranslations(bottles));
});

router.post('/import/preview', importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new BadRequestError();

  let payload: NormalizedImportPayload;
  try {
    payload = parseImportFile(req.file.originalname || '', req.file.buffer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new BadRequestError('errors.invalidImportFile', { reason });
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
});

const importConfirmSchemas = { body: BottleImportConfirm };

router.post('/import/confirm', validate(importConfirmSchemas), async (_req: AuthRequest, res: Response) => {
  const { payload, resolutions } = valid<typeof importConfirmSchemas>(res).body;

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
        // The schema fills the type, desired stock and minimum percent defaults
        const { nameTranslations, name, type, desiredStock, minimumPercent } = resolution.data;
        const existingType = await tx.categoryType.findUnique({ where: { name: type } });
        if (!existingType) {
          await tx.categoryType.create({ data: { name: type, color: 'gray' } });
        }
        const createdCat = await tx.category.create({
          data: {
            name: name || key,
            type,
            desiredStock,
            minimumPercent,
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

      for (let q = 0; q < b.quantity; q++) {
        const newBottle = await tx.bottle.create({
          data: {
            name: b.name,
            categoryId,
            capacityMl: b.capacityMl,
            remainingPercent: b.remainingPercent,
            alcoholPercentage: b.alcoholPercentage,
            purchasePrice: b.purchasePrice,
            location: b.location,
            openedAt: b.openedAt,
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
});

const exportSchemas = { query: BottleExportQuery };

router.get('/export', validate(exportSchemas), async (_req: AuthRequest, res: Response) => {
  const { categoryId, type, location, search, format } = valid<typeof exportSchemas>(res).query;

  const where: Prisma.BottleWhereInput = {};
  if (categoryId) where.categoryId = categoryId;
  if (type) where.category = { type };
  if (location) where.location = { contains: location };
  if (search) where.name = { contains: search };

  const bottles = await prisma.bottle.findMany({
    where,
    include: { category: true },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });

  const date = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const csv = buildCsvPayload(bottles);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bottles-${date}.csv"`);
    res.send(csv);
    return;
  }

  const payload = buildExportPayload(bottles);
  res.setHeader('Content-Disposition', `attachment; filename="bottles-${date}.json"`);
  res.json(payload);
});

router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const bottle = await prisma.bottle.findUnique({
    where: { id: valid<typeof idRequest>(res).params.id },
    include: { category: true },
  });
  if (!bottle) throw new NotFoundError();
  res.json(parseNameTranslations(bottle));
});

const createSchemas = { body: BottleCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { quantity, ...fields } = valid<typeof createSchemas>(res).body;

  const count = quantity ?? 1;
  // ?? and not ||: a price or an alcohol percentage of 0 is kept
  const data = {
    name: fields.name,
    categoryId: fields.categoryId,
    purchasePrice: fields.purchasePrice ?? null,
    capacityMl: fields.capacityMl,
    remainingPercent: fields.remainingPercent ?? 100,
    openedAt: fields.openedAt ?? null,
    alcoholPercentage: fields.alcoholPercentage ?? null,
    location: fields.location || null,
    isApero: fields.isApero ?? false,
    isDigestif: fields.isDigestif ?? false,
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
});

const updateSchemas = { params: IdParams, body: BottleUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { location, ...fields } = body;
  // Absent fields are undefined, which Prisma leaves untouched
  const bottle = await prisma.bottle.update({
    where: { id },
    data: {
      ...fields,
      ...(location !== undefined && { location: location || null }),
    },
    include: { category: true },
  });

  // Auto-sync bottle menus if flags changed
  if (fields.isApero !== undefined || fields.isDigestif !== undefined) {
    await syncBottleMenus(bottle.id, bottle.isApero, bottle.isDigestif);
  }

  res.json(parseNameTranslations(bottle));
});

// Refused while recipes use the bottle as a source, unless ?force=true
router.delete('/:id', validate(deleteRequest), async (req: AuthRequest, res: Response) => {
  const { params: { id }, query } = valid<typeof deleteRequest>(res);
  const impact = await deleteBottle(id, isForceRequested(query.force));
  res.json({ message: req.t('bottles.deleted'), deleted: true, impact });
});

export default router;
