import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';

const router = Router();

router.get('/', async (_req: AuthRequest, res: Response) => {
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  res.json(parseNameTranslations(units));
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const unit = await prisma.unit.findUnique({
    where: { id: parseInt(String(req.params.id)) },
  });
  if (!unit) throw new NotFoundError();
  res.json(parseNameTranslations(unit));
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, abbreviation, conversionFactorToMl, nameTranslations } = req.body;
  if (!name || !abbreviation) throw new BadRequestError();
  const unit = await prisma.unit.create({
    data: {
      name,
      abbreviation,
      conversionFactorToMl: conversionFactorToMl !== undefined ? conversionFactorToMl : null,
      nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
    },
  });
  res.status(201).json(parseNameTranslations(unit));
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, abbreviation, conversionFactorToMl, nameTranslations } = req.body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (abbreviation !== undefined) updateData.abbreviation = abbreviation;
  if (conversionFactorToMl !== undefined) updateData.conversionFactorToMl = conversionFactorToMl;
  if (nameTranslations !== undefined) updateData.nameTranslations = nameTranslations ? JSON.stringify(nameTranslations) : null;

  const unit = await prisma.unit.update({
    where: { id: parseInt(String(req.params.id)) },
    data: updateData,
  });
  res.json(parseNameTranslations(unit));
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.unit.delete({ where: { id: parseInt(String(req.params.id)) } });
  res.json({ message: req.t('units.deleted') });
});

export default router;
