import { Router, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { buildExportPayload, buildCsvPayload } from '../utils/bottlesExport';
import { ImportParseError, parseImportFile, NormalizedImportPayload } from '../utils/bottlesImport';
import { deleteBottle, isForceRequested } from '../services/deletionService';
import { syncAllBottleMenus, syncBottle } from '../services/menuSyncService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, IdParams, idRequest } from '../validation/common';
import { BottleCreate, BottleExportQuery, BottleListQuery, BottleUpdate } from '../validation/bottles';
import { BottleImportConfirm } from '../validation/bottleImport';

const router = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

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

// The confirmation creates the bottles in batches: SQLite caps the parameters of one statement
const CREATE_BATCH_SIZE = 500;
// A 2,000-bottle import takes well under a second; the 5 s default leaves no margin on a slow disk
const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;

/** Same name, capacity and category, whatever the case: the import warns about such a bottle. */
function duplicateKey(name: string, capacityMl: number, categoryName: string): string {
  return `${name.toLowerCase()}|${capacityMl}|${categoryName.toLowerCase()}`;
}

function parseUploadedFile(file: Express.Multer.File, language: string): NormalizedImportPayload {
  try {
    return parseImportFile(file.originalname || '', file.buffer, language);
  } catch (err) {
    if (!(err instanceof ImportParseError)) throw err;
    throw new BadRequestError(`errors.import.${err.code}`, { code: err.code, ...err.params });
  }
}

router.post('/import/preview', importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new BadRequestError();

  // The rows left out are listed apart: the payload goes back unchanged to /import/confirm
  // A date typed in a spreadsheet is read in the order of the app's language (Accept-Language)
  const { errors, ...payload } = parseUploadedFile(req.file, req.language);

  const allCategories = await prisma.category.findMany();
  const allBottles = await prisma.bottle.findMany({ include: { category: true } });

  // Indexes instead of a scan per imported row: an import has up to 2,000 rows
  const categoriesByName = new Map<string, (typeof allCategories)[number]>();
  for (const category of allCategories) {
    const key = category.name.toLowerCase();
    // The first match wins, as before
    if (!categoriesByName.has(key)) categoriesByName.set(key, category);
  }
  const bottlesByKey = new Map<string, typeof allBottles>();
  for (const bottle of allBottles) {
    const key = duplicateKey(bottle.name, bottle.capacityMl, bottle.category.name);
    const sameKey = bottlesByKey.get(key);
    if (sameKey) sameKey.push(bottle);
    else bottlesByKey.set(key, [bottle]);
  }

  const categories = payload.categories.map((c) => {
    const match = categoriesByName.get(c.name.toLowerCase());
    return {
      ref: c,
      existingMatch: match
        ? { id: match.id, name: match.name, type: match.type, desiredStock: match.desiredStock }
        : null,
      status: match ? ('matched' as const) : ('missing' as const),
    };
  });

  const bottles = payload.bottles.map((b) => {
    const duplicates = (bottlesByKey.get(duplicateKey(b.name, b.capacityMl, b.categoryName)) ?? [])
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

  res.json({ payload, categories, bottles, errors });
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

    let skippedNoCategory = 0;
    let duplicatesCreated = 0;
    const rows: Prisma.BottleCreateManyInput[] = [];

    const bottleResolutions = resolutions?.bottles || {};

    const existingBottles = await tx.bottle.findMany({ include: { category: true } });
    const existingKeys = new Set(
      existingBottles.map((b) => duplicateKey(b.name, b.capacityMl, b.category.name))
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

      if (existingKeys.has(duplicateKey(b.name, b.capacityMl, finalCategoryName))) {
        duplicatesCreated += b.quantity;
      }

      const data: Prisma.BottleCreateManyInput = {
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
      };
      for (let q = 0; q < b.quantity; q++) rows.push(data);
    }

    for (let start = 0; start < rows.length; start += CREATE_BATCH_SIZE) {
      await tx.bottle.createMany({ data: rows.slice(start, start + CREATE_BATCH_SIZE) });
    }

    // Inside the transaction: a failed sync also cancels the import
    await syncAllBottleMenus(tx);
    return { createdCount: rows.length, skippedNoCategory, duplicatesCreated };
  }, { timeout: IMPORT_TRANSACTION_TIMEOUT_MS });

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

  // A failed menu sync also cancels the creation of the bottles
  const bottles = await prisma.$transaction(async (tx) => {
    const created = await tx.bottle.createManyAndReturn({
      data: Array.from({ length: count }, () => data),
      include: { category: true },
    });
    // Per bottle, not syncAllBottleMenus: only the new bottles join the menus, in creation order
    for (const bottle of created) await syncBottle(tx, bottle.id);
    return created;
  });
  res.status(201).json(parseNameTranslations(count === 1 ? bottles[0] : bottles));
});

const updateSchemas = { params: IdParams, body: BottleUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { location, ...fields } = body;
  const bottle = await prisma.$transaction(async (tx) => {
    // Absent fields are undefined, which Prisma leaves untouched
    const updated = await tx.bottle.update({
      where: { id },
      data: {
        ...fields,
        ...(location !== undefined && { location: location || null }),
      },
      include: { category: true },
    });
    // Always: the result must not depend on which fields the client sent
    await syncBottle(tx, updated.id);
    return updated;
  });

  res.json(parseNameTranslations(bottle));
});

// Refused while recipes use the bottle as a source, unless ?force=true
router.delete('/:id', validate(deleteRequest), async (req: AuthRequest, res: Response) => {
  const { params: { id }, query } = valid<typeof deleteRequest>(res);
  const impact = await deleteBottle(id, isForceRequested(query.force));
  res.json({ message: req.t('bottles.deleted'), deleted: true, impact });
});

export default router;
