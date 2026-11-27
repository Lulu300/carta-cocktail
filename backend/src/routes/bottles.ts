import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import type { Category } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { buildExportPayload, buildCsvPayload } from '../utils/bottlesExport';
import {
  ImportParseError,
  MAX_BOTTLE_IMPORT_BYTES,
  parseImportFile,
  NormalizedImportPayload,
} from '../utils/bottlesImport';
import { deleteBottle, isForceRequested } from '../services/deletionService';
import { syncBottle, syncNewBottles } from '../services/menuSyncService';
import { categoryTypeNameFor, createMissingCategoryType } from '../services/categoryTypeService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, DeletionResponse, IdParams, idRequest } from '../validation/common';
import {
  Bottle,
  BottleCreate,
  BottleExportQuery,
  BottleListQuery,
  BottleUpdate,
} from '../validation/bottles';
import {
  BottleImportConfirm,
  BottleImportConfirmResponse,
  BottleImportPreviewResponse,
  BottlesExport,
} from '../validation/bottleImport';
import { apiDocs, FORCED_DELETION } from '../openapi/routeDoc';
import { importedCategoryTypePath } from '../validation/categories';
import { CaseInsensitiveIndex, previewMatch } from '../utils/uniqueness';
import { nameToStore, translationsToStore } from '../utils/storedNames';
import { caseInsensitiveKey } from '../utils/invisibleCharacters';

const router = Router();
const doc = apiDocs('Bottles');

const NOT_FOUND = 'No bottle has this id.';
const IMPORT_FILE_FIELD = 'file';

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BOTTLE_IMPORT_BYTES },
});

const listSchemas = { query: BottleListQuery };

router.get(
  '/',
  doc({
    operationId: 'listBottles',
    summary: 'List the bottles',
    description: 'With their category, by category name then bottle name.',
    responses: { 200: z.array(Bottle) },
  }),
  validate(listSchemas),
  async (_req: AuthRequest, res: Response) => {
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
  },
);

// The confirmation creates the bottles in batches: SQLite caps the parameters of one statement
const CREATE_BATCH_SIZE = 500;
// A 2,000-bottle import takes well under a second; the 5 s default leaves no margin on a slow disk
const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Same name whatever the case, capacity and category: the import warns about such a bottle.
 * `category` is the category name in the preview, which has no resolution yet, under the key
 * categories are compared with (`caseInsensitiveKey`), and the id of the category a row is
 * resolved to in the confirmation.
 */
function duplicateKey(name: string, capacityMl: number, category: string | number): string {
  return `${name.toLowerCase()}|${capacityMl}|${category}`;
}

function previewCategory(category: Category) {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    desiredStock: category.desiredStock,
  };
}

function parseUploadedFile(file: Express.Multer.File, language: string): NormalizedImportPayload {
  try {
    return parseImportFile(file.originalname || '', file.buffer, language);
  } catch (err) {
    if (!(err instanceof ImportParseError)) throw err;
    throw new BadRequestError(`errors.import.${err.code}`, { code: err.code, ...err.params });
  }
}

router.post(
  '/import/preview',
  doc({
    operationId: 'previewBottleImport',
    summary: 'Preview the import of a bottle file',
    description:
      'Reads the file and compares its rows with the stored categories and bottles. Nothing is written: the `payload` of the answer goes back to `POST /api/bottles/import/confirm`.',
    upload: {
      field: IMPORT_FILE_FIELD,
      description:
        'A `.csv`, `.json` or `.zip` file (an export of `GET /api/bottles/export`), read by its extension.',
      maxBytes: MAX_BOTTLE_IMPORT_BYTES,
    },
    responses: { 200: BottleImportPreviewResponse },
    errors: {
      400: 'No file, or a file that cannot be read: `details.code` tells why (format, header, rows).',
    },
  }),
  importUpload.single(IMPORT_FILE_FIELD),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new BadRequestError();

    // The rows left out and the values to check are listed apart: the payload goes back unchanged to /import/confirm
    // A date typed in a spreadsheet is read in the order of the app's language (Accept-Language)
    const { errors, warnings, ...payload } = parseUploadedFile(req.file, req.language);

    const allBottles = await prisma.bottle.findMany({ include: { category: true } });

    // Indexes instead of a scan per imported row: an import has up to 2,000 rows
    const categoriesByName = new CaseInsensitiveIndex(
      await prisma.category.findMany(),
      (category) => category.name,
    );
    const bottlesByKey = new Map<string, typeof allBottles>();
    for (const bottle of allBottles) {
      const key = duplicateKey(
        bottle.name,
        bottle.capacityMl,
        caseInsensitiveKey(bottle.category.name),
      );
      const sameKey = bottlesByKey.get(key);
      if (sameKey) sameKey.push(bottle);
      else bottlesByKey.set(key, [bottle]);
    }

    const categories = payload.categories.map((c) => ({
      ref: c,
      ...previewMatch(categoriesByName.match(c.name), previewCategory),
    }));

    const bottles = payload.bottles.map((b) => {
      const duplicates = (
        bottlesByKey.get(duplicateKey(b.name, b.capacityMl, caseInsensitiveKey(b.categoryName))) ??
        []
      ).map((d) => ({
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

    res.json({ payload, categories, bottles, errors, warnings });
  },
);

const importConfirmSchemas = { body: BottleImportConfirm };

router.post(
  '/import/confirm',
  doc({
    operationId: 'confirmBottleImport',
    summary: 'Import bottles',
    description:
      'Creates the bottles of the previewed payload, with the resolutions of the admin, in one transaction. The body may weigh up to 5 MB.',
    responses: { 201: BottleImportConfirmResponse },
    errors: { 409: 'A category name of the file matches several categories ignoring case.' },
  }),
  validate(importConfirmSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { payload, resolutions } = valid<typeof importConfirmSchemas>(res).body;

    const created = await prisma.$transaction(
      async (tx) => {
        const resolvedCategories = new Map<string, number>(); // lowercased name -> id
        const categories = await tx.category.findMany();
        const existingCategories = new CaseInsensitiveIndex(
          categories,
          (category) => category.name,
        );
        const existingCategoryIds = new Set(categories.map((category) => category.id));

        // Apply explicit category resolutions
        for (const [key, resolution] of Object.entries(resolutions?.categories || {})) {
          if (resolution.action === 'use_existing' && resolution.existingId) {
            resolvedCategories.set(key.toLowerCase(), resolution.existingId);
          } else if (resolution.action === 'create' && resolution.data) {
            // The schema fills the type, desired stock and minimum percent defaults
            const { nameTranslations, name, type, desiredStock, minimumPercent } = resolution.data;
            const categoryName = name || key;
            // Checked before the lookup, so the request is refused or not whatever the database holds
            const typeName = await categoryTypeNameFor(tx, type, importedCategoryTypePath(key));
            // A category that exists ignoring case is used as it is, its type included
            const category = await existingCategories.findOrCreate(
              categoryName,
              'errors.ambiguousCategoryName',
              async () => {
                await createMissingCategoryType(tx, typeName);
                return tx.category.create({
                  data: {
                    name: nameToStore(categoryName),
                    type: typeName,
                    desiredStock,
                    minimumPercent,
                    nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
                  },
                });
              },
            );
            // Under the file's name, as `use_existing`: the rows name it, even when the admin renamed
            // the category. A row moved to the new name finds it in `existingCategories`.
            resolvedCategories.set(key.toLowerCase(), category.id);
          }
        }

        // A row goes in the category resolved for its name, else in the existing one of that name
        const categoryIdOf = (categoryName: string) =>
          resolvedCategories.get(categoryName.toLowerCase()) ??
          existingCategories.findUnambiguous(categoryName, 'errors.ambiguousCategoryName')?.id;

        // An existing category picked by its id, else the category of the row's name, else of the file's
        const rowCategoryId = (
          fileCategory: string,
          resolution: { categoryId?: number; categoryName?: string },
        ) => {
          if (resolution.categoryId !== undefined) {
            return existingCategoryIds.has(resolution.categoryId)
              ? resolution.categoryId
              : undefined;
          }
          const categoryName = (resolution.categoryName || fileCategory).trim();
          return categoryName ? categoryIdOf(categoryName) : undefined;
        };

        let skippedNoCategory = 0;
        let duplicatesCreated = 0;
        const rows: Prisma.BottleCreateManyInput[] = [];

        const bottleResolutions = resolutions?.bottles || {};

        // By category id: a row may go in a category created under another name than the file's,
        // or in one of several categories that differ only by case
        const existingBottles = await tx.bottle.findMany();
        const existingKeys = new Set(
          existingBottles.map((b) => duplicateKey(b.name, b.capacityMl, b.categoryId)),
        );

        for (let i = 0; i < payload.bottles.length; i++) {
          const b = payload.bottles[i];
          const resolution = bottleResolutions[String(i)] ?? { action: 'import' as const };

          if (resolution.action === 'skip') continue;

          const categoryId = rowCategoryId(b.categoryName, resolution);
          if (!categoryId) {
            skippedNoCategory++;
            continue;
          }

          if (existingKeys.has(duplicateKey(b.name, b.capacityMl, categoryId))) {
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

        const createdIds: number[] = [];
        for (let start = 0; start < rows.length; start += CREATE_BATCH_SIZE) {
          const batch = await tx.bottle.createManyAndReturn({
            data: rows.slice(start, start + CREATE_BATCH_SIZE),
            select: { id: true },
          });
          createdIds.push(...batch.map((bottle) => bottle.id));
        }

        // Inside the transaction: a failed sync also cancels the import
        await syncNewBottles(tx, createdIds);
        return { createdCount: rows.length, skippedNoCategory, duplicatesCreated };
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );

    res.status(201).json({
      created: { bottles: created.createdCount },
      duplicatesCreated: created.duplicatesCreated,
      skippedNoCategory: created.skippedNoCategory,
    });
  },
);

const exportSchemas = { query: BottleExportQuery };

router.get(
  '/export',
  doc({
    operationId: 'exportBottles',
    summary: 'Export the bottles',
    description: 'As a JSON or CSV file, filtered like the list.',
    responses: {
      200: {
        description: 'The file, `bottles-<date>.json` or `bottles-<date>.csv`.',
        content: { 'application/json': BottlesExport, 'text/csv': 'text' },
        headers: { 'Content-Disposition': 'attachment; filename="bottles-<yyyy-mm-dd>.<format>"' },
      },
    },
  }),
  validate(exportSchemas),
  async (_req: AuthRequest, res: Response) => {
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
  },
);

router.get(
  '/:id',
  doc({
    operationId: 'getBottle',
    summary: 'Get a bottle',
    responses: { 200: Bottle },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const bottle = await prisma.bottle.findUnique({
      where: { id: valid<typeof idRequest>(res).params.id },
      include: { category: true },
    });
    if (!bottle) throw new NotFoundError();
    res.json(parseNameTranslations(bottle));
  },
);

const createSchemas = { body: BottleCreate };

router.post(
  '/',
  doc({
    operationId: 'createBottles',
    summary: 'Create one or more identical bottles',
    description:
      'A `quantity` above 1 creates that many bottles and answers them all. The menus of their type follow.',
    responses: {
      201: {
        description: 'The bottle, or the list of bottles for a `quantity` above 1.',
        content: { 'application/json': z.union([Bottle, z.array(Bottle)]) },
      },
    },
    errors: { 400: 'Invalid request, or the category does not exist.' },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
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
      // Per bottle, not syncNewBottles: the new bottles join the menus in creation order
      for (const bottle of created) await syncBottle(tx, bottle.id);
      return created;
    });
    res.status(201).json(parseNameTranslations(count === 1 ? bottles[0] : bottles));
  },
);

const updateSchemas = { params: IdParams, body: BottleUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateBottle',
    summary: 'Update a bottle',
    description:
      'Only the fields present in the body change. The menus of its type follow its aperitif and digestif flags.',
    responses: { 200: Bottle },
    errors: { 400: 'Invalid request, or the category does not exist.', 404: NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body,
    } = valid<typeof updateSchemas>(res);
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
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'deleteBottle',
    summary: 'Delete a bottle',
    description: FORCED_DELETION.description,
    responses: { 200: DeletionResponse },
    errors: { 404: NOT_FOUND, 409: FORCED_DELETION.conflict },
  }),
  validate(deleteRequest),
  async (req: AuthRequest, res: Response) => {
    const {
      params: { id },
      query,
    } = valid<typeof deleteRequest>(res);
    const impact = await deleteBottle(id, isForceRequested(query.force));
    res.json({ message: req.t('bottles.deleted'), deleted: true, impact });
  },
);

export default router;
