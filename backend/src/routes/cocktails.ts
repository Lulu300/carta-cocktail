import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MessageResponse } from '../validation/common';
import {
  Cocktail,
  CocktailCreate,
  CocktailExportBatch,
  CocktailRow,
  CocktailUpdate,
} from '../validation/cocktails';
import {
  CocktailExportFile,
  CocktailExportFormat,
  ImportConfirm,
  ImportPreviewResponse,
  ImportRecipeV1,
} from '../validation/cocktailImport';
import { apiDocs } from '../openapi/routeDoc';
import { cocktailInclude } from '../services/cocktail/includes';
import { exportCocktail, exportCocktails } from '../services/cocktail/cocktailExport';
import {
  ACCEPTED_IMAGE_TYPES,
  imageUpload,
  MAX_IMAGE_BYTES,
  setImage,
} from '../services/cocktail/cocktailImage';
import { confirmImport, previewImport } from '../services/cocktail/cocktailImport';
import {
  createCocktail,
  removeCocktail,
  updateCocktail,
} from '../services/cocktail/cocktailService';

const router = Router();
const doc = apiDocs('Cocktails');

const NOT_FOUND = 'No cocktail has this id.';
const UNKNOWN_REFERENCE =
  'Invalid request, or a recipe line names a bottle, category, ingredient or unit that does not exist.';
const IMAGE_FIELD = 'image';

router.get(
  '/:id/export',
  doc({
    operationId: 'exportCocktail',
    summary: 'Export a cocktail as a JSON file',
    // Notes and preferred bottles included: the admin owns them
    description: 'The file `POST /api/cocktails/import/preview` reads, private fields included.',
    responses: {
      200: {
        description: 'The recipe, as a file to save.',
        content: { 'application/json': CocktailExportFormat },
        headers: { 'Content-Disposition': 'attachment; filename="<cocktail name>.json"' },
      },
    },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const { id } = valid<typeof idRequest>(res).params;
    const exported = await exportCocktail({ id }, { includePrivate: true });
    if (!exported) throw new NotFoundError();
    res.attachment(exported.filename).json(exported.payload);
  },
);

// Export several cocktails in one request, as the files the single export gives. The admin's
// ZIP export uses it: one request per cocktail would reach the API rate limit with a few hundred.
const exportBatchSchemas = { body: CocktailExportBatch };

router.post(
  '/export',
  doc({
    operationId: 'exportCocktails',
    summary: 'Export several cocktails',
    description: 'One file per cocktail, as `GET /api/cocktails/{id}/export` gives it.',
    responses: { 200: z.array(CocktailExportFile) },
    errors: { 404: 'One of the ids names no cocktail.' },
  }),
  validate(exportBatchSchemas),
  async (_req: AuthRequest, res: Response) => {
    const files = await exportCocktails(valid<typeof exportBatchSchemas>(res).body.ids, {
      includePrivate: true,
    });
    if (!files) throw new NotFoundError();
    res.json(files.map(({ filename, payload }) => ({ filename, data: payload })));
  },
);

// Import preview: analyze JSON and return matched/missing entities
const importPreviewSchemas = { body: ImportRecipeV1 };

router.post(
  '/import/preview',
  doc({
    operationId: 'previewCocktailImport',
    summary: 'Preview the import of a cocktail file',
    description:
      'Tells, for each bottle, category, ingredient and unit the file names, whether it exists. Nothing is written.',
    responses: { 200: ImportPreviewResponse },
  }),
  validate(importPreviewSchemas),
  async (_req: AuthRequest, res: Response) => {
    res.json(await previewImport(valid<typeof importPreviewSchemas>(res).body.cocktail));
  },
);

// Import confirm: create missing entities + cocktail in a transaction
const importConfirmSchemas = { body: ImportConfirm };

router.post(
  '/import/confirm',
  doc({
    operationId: 'confirmCocktailImport',
    summary: 'Import a cocktail file',
    description:
      'Creates the cocktail, and the entities the resolutions ask to create, in one transaction.',
    responses: { 201: Cocktail },
    errors: {
      400: 'Invalid request, or a name of the file is left unresolved: `details` lists them.',
    },
  }),
  validate(importConfirmSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { recipe, resolutions } = valid<typeof importConfirmSchemas>(res).body;
    const cocktail = await confirmImport(recipe.cocktail, resolutions);
    res.status(201).json(parseNameTranslations(cocktail));
  },
);

router.get(
  '/',
  doc({
    operationId: 'listCocktails',
    summary: 'List the cocktails',
    description: 'With their recipe.',
    responses: { 200: z.array(Cocktail) },
  }),
  async (_req: AuthRequest, res: Response) => {
    const cocktails = await prisma.cocktail.findMany({
      include: cocktailInclude,
      orderBy: { name: 'asc' },
    });
    res.json(parseNameTranslations(cocktails));
  },
);

router.get(
  '/:id',
  doc({
    operationId: 'getCocktail',
    summary: 'Get a cocktail',
    responses: { 200: Cocktail },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: valid<typeof idRequest>(res).params.id },
      include: cocktailInclude,
    });
    if (!cocktail) throw new NotFoundError();
    res.json(parseNameTranslations(cocktail));
  },
);

const createSchemas = { body: CocktailCreate };

router.post(
  '/',
  doc({
    operationId: 'createCocktail',
    summary: 'Create a cocktail',
    responses: { 201: Cocktail },
    errors: { 400: UNKNOWN_REFERENCE },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const cocktail = await createCocktail(valid<typeof createSchemas>(res).body);
    res.status(201).json(parseNameTranslations(cocktail));
  },
);

const updateSchemas = { params: IdParams, body: CocktailUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateCocktail',
    summary: 'Update a cocktail',
    description:
      'Only the fields present in the body change. Lists sent (ingredients, instructions) replace the stored ones.',
    responses: { 200: Cocktail },
    errors: { 400: UNKNOWN_REFERENCE, 404: NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body,
    } = valid<typeof updateSchemas>(res);
    res.json(parseNameTranslations(await updateCocktail(id, body)));
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'deleteCocktail',
    summary: 'Delete a cocktail',
    responses: { 200: MessageResponse },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
    await removeCocktail(valid<typeof idRequest>(res).params.id);
    res.json({ message: req.t('cocktails.deleted') });
  },
);

// The id is checked before multer reads the file
router.post(
  '/:id/image',
  doc({
    operationId: 'uploadCocktailPhoto',
    summary: 'Set the photo of a cocktail',
    description:
      'The photo is stored as WebP copies of several widths, without its metadata; the file sent is not kept.',
    upload: {
      field: IMAGE_FIELD,
      description: 'The photo.',
      maxBytes: MAX_IMAGE_BYTES,
      mediaTypes: ACCEPTED_IMAGE_TYPES,
    },
    responses: { 200: CocktailRow },
    errors: {
      400: 'No file, a file of another type, or an image that cannot be read.',
      404: NOT_FOUND,
    },
  }),
  validate(idRequest),
  imageUpload.single(IMAGE_FIELD),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new BadRequestError();
    res.json(await setImage(valid<typeof idRequest>(res).params.id, req.file));
  },
);

export default router;
