import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { assertUniqueIgnoringCase } from '../utils/uniqueness';
import { deleteUnit } from '../services/deletionService';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest } from '../validation/common';
import { UnitCreate, UnitUpdate } from '../validation/units';

const router = Router();

async function assertAbbreviationIsFree(abbreviation: string, ownId?: number) {
  const units = await prisma.unit.findMany({ select: { id: true, abbreviation: true } });
  assertUniqueIgnoringCase(units.map((u) => ({ id: u.id, value: u.abbreviation })), abbreviation, ownId);
}

router.get('/', async (_req: AuthRequest, res: Response) => {
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  res.json(parseNameTranslations(units));
});

router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const { id } = valid<typeof idRequest>(res).params;
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) throw new NotFoundError();
  res.json(parseNameTranslations(unit));
});

const createSchemas = { body: UnitCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, abbreviation, conversionFactorToMl, nameTranslations } = valid<typeof createSchemas>(res).body;
  await assertAbbreviationIsFree(abbreviation);
  const unit = await prisma.unit.create({
    data: {
      name,
      abbreviation,
      conversionFactorToMl: conversionFactorToMl ?? null,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(unit));
});

const updateSchemas = { params: IdParams, body: UnitUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { name, abbreviation, conversionFactorToMl, nameTranslations } = body;
  if (abbreviation !== undefined) {
    await assertAbbreviationIsFree(abbreviation, id);
  }
  // Absent fields are undefined, which Prisma leaves untouched
  const unit = await prisma.unit.update({
    where: { id },
    data: {
      name,
      abbreviation,
      conversionFactorToMl,
      ...(nameTranslations !== undefined && {
        nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
      }),
    },
  });
  res.json(parseNameTranslations(unit));
});

// Refused while recipes use the unit; there is no forced deletion for units
router.delete('/:id', validate(idRequest), async (req: AuthRequest, res: Response) => {
  await deleteUnit(valid<typeof idRequest>(res).params.id);
  res.json({ message: req.t('units.deleted') });
});

export default router;
