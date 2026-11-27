import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ConflictError, NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { translationsToStore } from '../utils/storedNames';
import { valid, validate } from '../validation/validate';
import {
  CategoryType,
  CategoryTypeCreate,
  CategoryTypeListItem,
  CategoryTypeParams,
  CategoryTypeQuery,
  CategoryTypeUpdate,
} from '../validation/categoryTypes';
import { requireNewCategoryTypeName } from '../services/categoryTypeService';
import { apiDocs } from '../openapi/routeDoc';
import { MessageResponse } from '../validation/common';

const router = Router();
const doc = apiDocs('Category types');

const NOT_FOUND = 'No category type has this name.';
const IN_USE = 'Categories still have this type.';
// Data older than v1.9.0 can hold a type with an empty name, which a path segment cannot carry
const BY_QUERY = 'The same as with the name in the path, for a type whose name is empty.';

router.get(
  '/',
  doc({
    operationId: 'listCategoryTypes',
    summary: 'List the category types',
    description: 'With the number of categories of each.',
    responses: { 200: z.array(CategoryTypeListItem) },
  }),
  async (_req: AuthRequest, res: Response) => {
    const types = await prisma.categoryType.findMany({
      include: { _count: { select: { categories: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(parseNameTranslations(types));
  },
);

const createSchemas = { body: CategoryTypeCreate };

router.post(
  '/',
  doc({
    operationId: 'createCategoryType',
    summary: 'Create a category type',
    description: 'The name is stored in upper case.',
    responses: { 201: CategoryType },
    errors: { 409: 'A type has this name.' },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { name, nameTranslations, color } = valid<typeof createSchemas>(res).body;
    // Upper case first: it can decompose a composed letter ('ΐ' becomes 'Ι\u0308\u0301')
    const typeName = requireNewCategoryTypeName(name.toUpperCase(), ['body', 'name']);
    const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
    if (existing) throw new ConflictError();
    const created = await prisma.categoryType.create({
      data: {
        name: typeName,
        nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
        color: color || 'gray',
      },
    });
    res.status(201).json(parseNameTranslations(created));
  },
);

type CategoryTypeChanges = z.output<typeof CategoryTypeUpdate>;

async function updateCategoryType(
  typeName: string,
  { nameTranslations, color }: CategoryTypeChanges,
) {
  const existing = await prisma.categoryType.findUnique({ where: { name: typeName } });
  if (!existing) throw new NotFoundError();
  const updated = await prisma.categoryType.update({
    where: { name: typeName },
    data: {
      nameTranslations: serializeTranslations(
        translationsToStore(nameTranslations, existing.nameTranslations),
      ),
      ...(color !== undefined && { color }),
    },
  });
  return parseNameTranslations(updated);
}

async function deleteCategoryType(typeName: string): Promise<void> {
  const usageCount = await prisma.category.count({ where: { type: typeName } });
  if (usageCount > 0) throw new ConflictError('errors.typeInUse');
  await prisma.categoryType.delete({ where: { name: typeName } });
}

// The type is named in the path (`/SPIRIT`), or in the query (`?name=`): see BY_QUERY.

const updateSchemas = { params: CategoryTypeParams, body: CategoryTypeUpdate };

router.put(
  '/:name',
  doc({
    operationId: 'updateCategoryType',
    summary: 'Update a category type',
    description: 'Its translated names and color; the name does not change.',
    responses: { 200: CategoryType },
    errors: { 404: NOT_FOUND },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { params, body } = valid<typeof updateSchemas>(res);
    res.json(await updateCategoryType(params.name, body));
  },
);

const updateByQuerySchemas = { query: CategoryTypeQuery, body: CategoryTypeUpdate };

router.put(
  '/',
  doc({
    operationId: 'updateCategoryTypeByQuery',
    summary: 'Update a category type named in the query',
    description: BY_QUERY,
    responses: { 200: CategoryType },
    errors: { 404: NOT_FOUND },
  }),
  validate(updateByQuerySchemas),
  async (_req: AuthRequest, res: Response) => {
    const { query, body } = valid<typeof updateByQuerySchemas>(res);
    res.json(await updateCategoryType(query.name, body));
  },
);

const deleteSchemas = { params: CategoryTypeParams };

router.delete(
  '/:name',
  doc({
    operationId: 'deleteCategoryType',
    summary: 'Delete a category type',
    responses: { 200: MessageResponse },
    errors: { 404: NOT_FOUND, 409: IN_USE },
  }),
  validate(deleteSchemas),
  async (req: AuthRequest, res: Response) => {
    await deleteCategoryType(valid<typeof deleteSchemas>(res).params.name);
    res.json({ message: req.t('categoryTypes.deleted') });
  },
);

const deleteByQuerySchemas = { query: CategoryTypeQuery };

router.delete(
  '/',
  doc({
    operationId: 'deleteCategoryTypeByQuery',
    summary: 'Delete a category type named in the query',
    description: BY_QUERY,
    responses: { 200: MessageResponse },
    errors: { 404: NOT_FOUND, 409: IN_USE },
  }),
  validate(deleteByQuerySchemas),
  async (req: AuthRequest, res: Response) => {
    await deleteCategoryType(valid<typeof deleteByQuerySchemas>(res).query.name);
    res.json({ message: req.t('categoryTypes.deleted') });
  },
);

export default router;
