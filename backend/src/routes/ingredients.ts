import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { nameToStore, translationsToStore } from '../utils/storedNames';
import { deleteIngredient, isForceRequested } from '../services/deletionService';
import { apiDocs, FORCED_DELETION } from '../openapi/routeDoc';
import { valid, validate } from '../validation/validate';
import { deleteRequest, DeletionResponse, IdParams, idRequest } from '../validation/common';
import {
  BulkAvailability,
  BulkAvailabilityResponse,
  Ingredient,
  IngredientCreate,
  IngredientUpdate,
} from '../validation/ingredients';

const router = Router();
const doc = apiDocs('Ingredients');

const NOT_FOUND = 'No ingredient has this id.';

router.get(
  '/',
  doc({
    operationId: 'listIngredients',
    summary: 'List the ingredients',
    description: 'The ingredients that are not bottles: garnishes, fresh items.',
    responses: { 200: z.array(Ingredient) },
  }),
  async (_req: AuthRequest, res: Response) => {
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    res.json(parseNameTranslations(ingredients));
  },
);

const bulkSchemas = { body: BulkAvailability };

router.post(
  '/bulk-availability',
  doc({
    operationId: 'setAllIngredientsAvailability',
    summary: 'Mark every ingredient available or not',
    responses: { 200: BulkAvailabilityResponse },
  }),
  validate(bulkSchemas),
  async (req: AuthRequest, res: Response) => {
    const { available } = valid<typeof bulkSchemas>(res).body;
    const result = await prisma.ingredient.updateMany({
      data: { isAvailable: available },
    });
    res.json({ message: req.t('ingredients.availabilityUpdated'), updated: result.count });
  },
);

router.get(
  '/:id',
  doc({
    operationId: 'getIngredient',
    summary: 'Get an ingredient',
    responses: { 200: Ingredient },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: valid<typeof idRequest>(res).params.id },
    });
    if (!ingredient) throw new NotFoundError();
    res.json(parseNameTranslations(ingredient));
  },
);

const createSchemas = { body: IngredientCreate };

router.post(
  '/',
  doc({
    operationId: 'createIngredient',
    summary: 'Create an ingredient',
    responses: { 201: Ingredient },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { name, icon, nameTranslations } = valid<typeof createSchemas>(res).body;
    const ingredient = await prisma.ingredient.create({
      data: {
        name: nameToStore(name),
        icon: icon || null,
        nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
      },
    });
    res.status(201).json(parseNameTranslations(ingredient));
  },
);

const updateSchemas = { params: IdParams, body: IngredientUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateIngredient',
    summary: 'Update an ingredient',
    description: 'Only the fields present in the body change.',
    responses: { 200: Ingredient },
    errors: { 404: NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body,
    } = valid<typeof updateSchemas>(res);
    const { name, icon, isAvailable, nameTranslations } = body;
    const stored = await prisma.ingredient.findUnique({ where: { id } });
    if (!stored) throw new NotFoundError();
    // Absent fields are undefined, which Prisma leaves untouched
    const ingredient = await prisma.ingredient.update({
      where: { id },
      data: {
        name: name === undefined ? undefined : nameToStore(name, stored.name),
        icon,
        isAvailable,
        nameTranslations: serializeTranslations(
          translationsToStore(nameTranslations, stored.nameTranslations),
        ),
      },
    });
    res.json(parseNameTranslations(ingredient));
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'deleteIngredient',
    summary: 'Delete an ingredient',
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
    const impact = await deleteIngredient(id, isForceRequested(query.force));
    res.json({ message: req.t('ingredients.deleted'), deleted: true, impact });
  },
);

export default router;
