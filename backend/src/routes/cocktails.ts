import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest } from '../validation/common';
import { CocktailCreate, CocktailUpdate } from '../validation/cocktails';
import { ImportConfirm, ImportRecipeV1 } from '../validation/cocktailImport';
import { cocktailInclude } from '../services/cocktail/includes';
import { exportCocktail } from '../services/cocktail/cocktailExport';
import { imageUpload, setImage } from '../services/cocktail/cocktailImage';
import { confirmImport, previewImport } from '../services/cocktail/cocktailImport';
import { createCocktail, removeCocktail, updateCocktail } from '../services/cocktail/cocktailService';

const router = Router();

// Export cocktail as JSON (notes and preferred bottles included: the admin owns them)
router.get('/:id/export', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const { id } = valid<typeof idRequest>(res).params;
  const exported = await exportCocktail({ id }, { includePrivate: true });
  if (!exported) throw new NotFoundError();
  res.attachment(exported.filename).json(exported.payload);
});

// Import preview: analyze JSON and return matched/missing entities
const importPreviewSchemas = { body: ImportRecipeV1 };

router.post('/import/preview', validate(importPreviewSchemas), async (_req: AuthRequest, res: Response) => {
  res.json(await previewImport(valid<typeof importPreviewSchemas>(res).body.cocktail));
});

// Import confirm: create missing entities + cocktail in a transaction
const importConfirmSchemas = { body: ImportConfirm };

router.post('/import/confirm', validate(importConfirmSchemas), async (_req: AuthRequest, res: Response) => {
  const { recipe, resolutions } = valid<typeof importConfirmSchemas>(res).body;
  const cocktail = await confirmImport(recipe.cocktail, resolutions);
  res.status(201).json(parseNameTranslations(cocktail));
});

// List all cocktails
router.get('/', async (_req: AuthRequest, res: Response) => {
  const cocktails = await prisma.cocktail.findMany({
    include: cocktailInclude,
    orderBy: { name: 'asc' },
  });
  res.json(parseNameTranslations(cocktails));
});

// Get one cocktail
router.get('/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const cocktail = await prisma.cocktail.findUnique({
    where: { id: valid<typeof idRequest>(res).params.id },
    include: cocktailInclude,
  });
  if (!cocktail) throw new NotFoundError();
  res.json(parseNameTranslations(cocktail));
});

// Create cocktail
const createSchemas = { body: CocktailCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const cocktail = await createCocktail(valid<typeof createSchemas>(res).body);
  res.status(201).json(parseNameTranslations(cocktail));
});

// Update cocktail: only the fields present in the body are written (see updateCocktail)
const updateSchemas = { params: IdParams, body: CocktailUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  res.json(parseNameTranslations(await updateCocktail(id, body)));
});

// Delete cocktail
router.delete('/:id', validate(idRequest), async (req: AuthRequest, res: Response) => {
  await removeCocktail(valid<typeof idRequest>(res).params.id);
  res.json({ message: req.t('cocktails.deleted') });
});

// Upload image. The id is checked before multer writes the file.
router.post('/:id/image', validate(idRequest), imageUpload.single('image'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new BadRequestError();
  res.json(await setImage(valid<typeof idRequest>(res).params.id, req.file));
});

export default router;
