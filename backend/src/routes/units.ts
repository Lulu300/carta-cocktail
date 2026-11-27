import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations, serializeTranslations } from '../utils/translations';
import { assertUniqueIgnoringCase } from '../utils/uniqueness';
import { nameToStore, translationsToStore } from '../utils/storedNames';
import { deleteUnit } from '../services/deletionService';
import { apiDocs } from '../openapi/routeDoc';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest, MessageResponse } from '../validation/common';
import { Unit, UnitCreate, UnitUpdate } from '../validation/units';

const router = Router();
const doc = apiDocs('Units');

const NOT_FOUND = 'No unit has this id.';
const ABBREVIATION_TAKEN = 'Another unit has this abbreviation, ignoring case.';

async function assertAbbreviationIsFree(abbreviation: string, ownId?: number) {
  const units = await prisma.unit.findMany({ select: { id: true, abbreviation: true } });
  assertUniqueIgnoringCase(
    units.map((u) => ({ id: u.id, value: u.abbreviation })),
    abbreviation,
    ownId,
  );
}

router.get(
  '/',
  doc({ operationId: 'listUnits', summary: 'List the units', responses: { 200: z.array(Unit) } }),
  async (_req: AuthRequest, res: Response) => {
    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(parseNameTranslations(units));
  },
);

router.get(
  '/:id',
  doc({
    operationId: 'getUnit',
    summary: 'Get a unit',
    responses: { 200: Unit },
    errors: { 404: NOT_FOUND },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const { id } = valid<typeof idRequest>(res).params;
    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundError();
    res.json(parseNameTranslations(unit));
  },
);

const createSchemas = { body: UnitCreate };

router.post(
  '/',
  doc({
    operationId: 'createUnit',
    summary: 'Create a unit',
    responses: { 201: Unit },
    errors: { 409: ABBREVIATION_TAKEN },
  }),
  validate(createSchemas),
  async (_req: AuthRequest, res: Response) => {
    const { name, abbreviation, conversionFactorToMl, nameTranslations } =
      valid<typeof createSchemas>(res).body;
    await assertAbbreviationIsFree(abbreviation);
    const unit = await prisma.unit.create({
      data: {
        name: nameToStore(name),
        abbreviation: nameToStore(abbreviation),
        conversionFactorToMl: conversionFactorToMl ?? null,
        nameTranslations: serializeTranslations(translationsToStore(nameTranslations)),
      },
    });
    res.status(201).json(parseNameTranslations(unit));
  },
);

const updateSchemas = { params: IdParams, body: UnitUpdate };

router.put(
  '/:id',
  doc({
    operationId: 'updateUnit',
    summary: 'Update a unit',
    description: 'Only the fields present in the body change.',
    responses: { 200: Unit },
    errors: { 404: NOT_FOUND, 409: ABBREVIATION_TAKEN },
  }),
  validate(updateSchemas),
  async (_req: AuthRequest, res: Response) => {
    const {
      params: { id },
      body,
    } = valid<typeof updateSchemas>(res);
    const { name, abbreviation, conversionFactorToMl, nameTranslations } = body;
    const stored = await prisma.unit.findUnique({ where: { id } });
    if (!stored) throw new NotFoundError();
    if (abbreviation !== undefined) {
      await assertAbbreviationIsFree(abbreviation, id);
    }
    // Absent fields are undefined, which Prisma leaves untouched
    const unit = await prisma.unit.update({
      where: { id },
      data: {
        name: name === undefined ? undefined : nameToStore(name, stored.name),
        abbreviation:
          abbreviation === undefined ? undefined : nameToStore(abbreviation, stored.abbreviation),
        conversionFactorToMl,
        nameTranslations: serializeTranslations(
          translationsToStore(nameTranslations, stored.nameTranslations),
        ),
      },
    });
    res.json(parseNameTranslations(unit));
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'deleteUnit',
    summary: 'Delete a unit',
    // A recipe line has no meaning without a unit: there is no forced deletion
    description: 'Refused while recipes use the unit: change the unit of their lines first.',
    responses: { 200: MessageResponse },
    errors: { 404: NOT_FOUND, 409: 'Recipes use the unit: `details` lists them.' },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
    await deleteUnit(valid<typeof idRequest>(res).params.id);
    res.json({ message: req.t('units.deleted') });
  },
);

export default router;
