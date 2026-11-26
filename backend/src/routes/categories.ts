import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { assertUniqueIgnoringCase } from '../utils/uniqueness';
import { nameToStore, translationsToStore } from '../utils/storedNames';
import { deleteCategory, isForceRequested } from '../services/deletionService';
import { ensureCategoryType } from '../services/categoryTypeService';
import { valid, validate } from '../validation/validate';
import { deleteRequest, IdParams, idRequest } from '../validation/common';
import { CategoryCreate, CategoryUpdate } from '../validation/categories';

const router = Router();

async function assertCategoryNameIsFree(name: string, ownId?: number) {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  assertUniqueIgnoringCase(
    categories.map((c) => ({ id: c.id, value: c.name })),
    name,
    ownId,
  );
}

// List all categories
router.get('/', async (_req: AuthRequest, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { bottles: true } }, categoryType: true },
    orderBy: { name: 'asc' },
  });
  res.json(parseNameTranslations(categories));
});

// Get one category
router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const category = await prisma.category.findUnique({
    where: { id: valid<typeof idRequest>(res).params.id },
    include: { bottles: true, categoryType: true },
  });
  if (!category) throw new NotFoundError();
  res.json(parseNameTranslations(category));
});

// Create category
const createSchemas = { body: CategoryCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, type, desiredStock, minimumPercent, nameTranslations } =
    valid<typeof createSchemas>(res).body;
  await assertCategoryNameIsFree(name);
  const category = await prisma.category.create({
    data: {
      name: nameToStore(name),
      type: await ensureCategoryType(prisma, type),
      // ?? and not ||: a desired stock of 0 is kept
      desiredStock: desiredStock ?? 1,
      minimumPercent: minimumPercent ?? 30,
      nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
    },
  });
  res.status(201).json(parseNameTranslations(category));
});

// Update category
const updateSchemas = { params: IdParams, body: CategoryUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const {
    params: { id },
    body,
  } = valid<typeof updateSchemas>(res);
  const { name, type, desiredStock, minimumPercent, nameTranslations } = body;
  const stored = await prisma.category.findUnique({ where: { id } });
  if (!stored) throw new NotFoundError();
  if (name !== undefined) {
    await assertCategoryNameIsFree(name, id);
  }
  const typeName = type === undefined ? undefined : await ensureCategoryType(prisma, type);
  // Absent fields are undefined, which Prisma leaves untouched
  const category = await prisma.category.update({
    where: { id },
    data: {
      name: name === undefined ? undefined : nameToStore(name, stored.name),
      type: typeName,
      desiredStock,
      minimumPercent,
      nameTranslations: serializeTranslations(
        translationsToStore(nameTranslations, stored.nameTranslations),
      ),
    },
  });
  res.json(parseNameTranslations(category));
});

// Delete category: refused while it holds bottles or recipes use it, unless ?force=true
router.delete('/:id', validate(deleteRequest), async (req: AuthRequest, res: Response) => {
  const {
    params: { id },
    query,
  } = valid<typeof deleteRequest>(res);
  const impact = await deleteCategory(id, isForceRequested(query.force));
  res.json({ message: req.t('categories.deleted'), deleted: true, impact });
});

export default router;
