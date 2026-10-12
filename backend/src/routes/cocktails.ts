import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { parseNameTranslations } from '../utils/translations';
import { valid, validate } from '../validation/validate';
import { IdParams, idRequest } from '../validation/common';
import { CocktailCreate, CocktailUpdate, IngredientLine, Tags } from '../validation/cocktails';
import { ImportConfirm, ImportRecipeV1 } from '../validation/cocktailImport';
import { refuseNewRecipeDefects } from '../services/recipeDefectsService';
import { cocktailInclude } from '../services/cocktail/includes';
import { exportCocktail } from '../services/cocktail/cocktailExport';
import { imageUpload, setImage } from '../services/cocktail/cocktailImage';
import { removeCocktail } from '../services/cocktail/cocktailService';

type ImportedRecipe = z.output<typeof ImportRecipeV1>['cocktail'];

const router = Router();

// Export cocktail as JSON (notes and preferred bottles included: the admin owns them)
router.get('/:id/export', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const { id } = valid<typeof idRequest>(res).params;
  const exported = await exportCocktail({ id }, { includePrivate: true });
  if (!exported) throw new NotFoundError();
  res.attachment(exported.filename).json(exported.payload);
});

// Entities a recipe refers to, keyed like the resolutions: lowercased unit
// abbreviation, or lowercased name for categories, bottles and ingredients.
function collectImportReferences(recipe: ImportedRecipe) {
  const unitRefs = new Map<string, any>();
  const categoryRefs = new Map<string, any>();
  const bottleRefs = new Map<string, any>();
  const ingredientRefs = new Map<string, any>();

  for (const ing of recipe.ingredients || []) {
    if (ing.unit) {
      unitRefs.set(ing.unit.abbreviation.toLowerCase(), {
        ...ing.unit,
        nameTranslations: ing.unit.nameTranslations || null,
      });
    }
    if (ing.sourceType === 'BOTTLE') {
      bottleRefs.set(ing.sourceName.toLowerCase(), {
        name: ing.sourceName,
        categoryName: ing.sourceDetail?.categoryName || '',
        categoryType: ing.sourceDetail?.categoryType || 'SPIRIT',
      });
      // Also need the category for this bottle
      if (ing.sourceDetail?.categoryName) {
        const catKey = ing.sourceDetail.categoryName.toLowerCase();
        if (!categoryRefs.has(catKey)) {
          categoryRefs.set(catKey, {
            name: ing.sourceDetail.categoryName,
            type: ing.sourceDetail.categoryType || 'SPIRIT',
            desiredStock: 1,
            nameTranslations: ing.sourceDetail.categoryNameTranslations || null,
          });
        }
      }
    } else if (ing.sourceType === 'CATEGORY') {
      categoryRefs.set(ing.sourceName.toLowerCase(), {
        name: ing.sourceName,
        type: ing.sourceDetail?.type || 'SPIRIT',
        desiredStock: ing.sourceDetail?.desiredStock || 1,
        nameTranslations: ing.sourceDetail?.nameTranslations || null,
      });
    } else if (ing.sourceType === 'INGREDIENT') {
      ingredientRefs.set(ing.sourceName.toLowerCase(), {
        name: ing.sourceName,
        icon: ing.sourceDetail?.icon || null,
        nameTranslations: ing.sourceDetail?.nameTranslations || null,
      });
    }

    // Preferred bottles
    for (const pb of ing.preferredBottles || []) {
      bottleRefs.set(pb.name.toLowerCase(), {
        name: pb.name,
        categoryName: pb.categoryName || '',
        categoryType: 'SPIRIT',
      });
      if (pb.categoryName) {
        const catKey = pb.categoryName.toLowerCase();
        if (!categoryRefs.has(catKey)) {
          categoryRefs.set(catKey, {
            name: pb.categoryName,
            type: 'SPIRIT',
            desiredStock: 1,
          });
        }
      }
    }
  }

  return { unitRefs, categoryRefs, bottleRefs, ingredientRefs };
}

// Import preview: analyze JSON and return matched/missing entities
const importPreviewSchemas = { body: ImportRecipeV1 };

router.post('/import/preview', validate(importPreviewSchemas), async (_req: AuthRequest, res: Response) => {
  const recipe = valid<typeof importPreviewSchemas>(res).body.cocktail;

  // Check if cocktail name already exists
  const existingCocktail = await prisma.cocktail.findFirst({
    where: { name: { equals: recipe.name } },
  });

  const { unitRefs, categoryRefs, bottleRefs, ingredientRefs } = collectImportReferences(recipe);

  // Match against existing entities
  const allUnits = await prisma.unit.findMany();
  const allCategories = await prisma.category.findMany();
  const allBottles = await prisma.bottle.findMany({ include: { category: true } });
  const allIngredients = await prisma.ingredient.findMany();

  const resolveEntities = <T extends Record<string, any>>(
    refs: Map<string, T>,
    existing: any[],
    matchField: string,
  ) => {
    return Array.from(refs.entries()).map(([key, ref]) => {
      const match = existing.find(
        (e) => e[matchField].toLowerCase() === key,
      );
      return {
        ref,
        existingMatch: match ? { id: match.id, name: match[matchField], ...match } : null,
        status: match ? ('matched' as const) : ('missing' as const),
      };
    });
  };

  const result = {
    cocktail: {
      name: recipe.name,
      description: recipe.description,
      tags: recipe.tags || [],
      alreadyExists: !!existingCocktail,
    },
    units: resolveEntities(unitRefs, allUnits, 'abbreviation'),
    categories: resolveEntities(categoryRefs, allCategories, 'name'),
    bottles: resolveEntities(bottleRefs, allBottles, 'name'),
    ingredients: resolveEntities(ingredientRefs, allIngredients, 'name'),
  };

  res.json(result);
});

// Import confirm: create missing entities + cocktail in a transaction
const importConfirmSchemas = { body: ImportConfirm };

router.post('/import/confirm', validate(importConfirmSchemas), async (_req: AuthRequest, res: Response) => {
  const { recipe: data, resolutions } = valid<typeof importConfirmSchemas>(res).body;
  const recipe = data.cocktail;
  // A name the admin cleared in the wizard falls back on the one in the file
  const refs = collectImportReferences(recipe);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Resolve units
    const unitMap = new Map<string, number>(); // abbreviation (lowercase) -> id
    for (const [key, r] of Object.entries(resolutions?.units || {})) {
      if (r.action === 'use_existing' && r.existingId) {
        unitMap.set(key.toLowerCase(), r.existingId);
      } else if (r.action === 'create' && r.data) {
        const { name, abbreviation, conversionFactorToMl, nameTranslations } = r.data;
        const fileUnit = refs.unitRefs.get(key.toLowerCase());
        const unitAbbreviation: string = abbreviation || fileUnit?.abbreviation || key;
        const created = await tx.unit.create({
          data: {
            // A hand-made file may give no unit name: the abbreviation names it then
            name: name || fileUnit?.name || unitAbbreviation,
            abbreviation: unitAbbreviation,
            conversionFactorToMl: conversionFactorToMl ?? null,
            nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
          },
        });
        unitMap.set(key.toLowerCase(), created.id);
      }
    }

    // 2. Resolve categories
    const categoryMap = new Map<string, number>(); // name (lowercase) -> id
    for (const [key, r] of Object.entries(resolutions?.categories || {})) {
      if (r.action === 'use_existing' && r.existingId) {
        categoryMap.set(key.toLowerCase(), r.existingId);
      } else if (r.action === 'create' && r.data) {
        // The schema defaults the type to SPIRIT
        const { name, type, desiredStock, minimumPercent, nameTranslations } = r.data;
        // Auto-create CategoryType if missing
        const existingType = await tx.categoryType.findUnique({ where: { name: type } });
        if (!existingType) {
          await tx.categoryType.create({ data: { name: type, color: 'gray' } });
        }
        const created = await tx.category.create({
          data: {
            name: name || refs.categoryRefs.get(key.toLowerCase())?.name || key,
            type,
            desiredStock,
            minimumPercent,
            nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
          },
        });
        categoryMap.set(key.toLowerCase(), created.id);
      }
    }

    // 3. Resolve bottles
    const bottleMap = new Map<string, number>(); // name (lowercase) -> id
    for (const [key, r] of Object.entries(resolutions?.bottles || {})) {
      if (r.action === 'use_existing' && r.existingId) {
        bottleMap.set(key.toLowerCase(), r.existingId);
      } else if (r.action === 'create' && r.data) {
        const { name, categoryName, capacityMl, remainingPercent, alcoholPercentage } = r.data;
        // Resolve category for this bottle
        const catId = categoryName ? categoryMap.get(categoryName.toLowerCase()) : null;
        if (!catId) continue; // skip if category not resolved
        const created = await tx.bottle.create({
          data: {
            name: name || refs.bottleRefs.get(key.toLowerCase())?.name || key,
            categoryId: catId,
            capacityMl,
            remainingPercent,
            alcoholPercentage,
          },
        });
        bottleMap.set(key.toLowerCase(), created.id);
      }
      // 'skip' action: do nothing, bottle will not be in the map
    }

    // 4. Resolve ingredients
    const ingredientMap = new Map<string, number>(); // name (lowercase) -> id
    for (const [key, r] of Object.entries(resolutions?.ingredients || {})) {
      if (r.action === 'use_existing' && r.existingId) {
        ingredientMap.set(key.toLowerCase(), r.existingId);
      } else if (r.action === 'create' && r.data) {
        const { name, icon, nameTranslations } = r.data;
        const created = await tx.ingredient.create({
          data: {
            name: name || refs.ingredientRefs.get(key.toLowerCase())?.name || key,
            icon: icon ?? null,
            nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null,
          },
        });
        ingredientMap.set(key.toLowerCase(), created.id);
      }
    }

    // 5. Build cocktail ingredients
    const ingredientsData = (recipe.ingredients || []).map((ing, index) => {
      const unitId = ing.unit
        ? unitMap.get(ing.unit.abbreviation.toLowerCase())
        : null;

      let sourceType = ing.sourceType;
      let bottleId: number | null = null;
      let categoryId: number | null = null;
      let ingredientId: number | null = null;

      if (ing.sourceType === 'BOTTLE') {
        bottleId = bottleMap.get(ing.sourceName.toLowerCase()) || null;
        if (!bottleId) {
          // Bottle was skipped - fall back to CATEGORY
          const catName = ing.sourceDetail?.categoryName?.toLowerCase();
          categoryId = catName ? categoryMap.get(catName) || null : null;
          sourceType = categoryId ? 'CATEGORY' : 'INGREDIENT';
        }
      } else if (ing.sourceType === 'CATEGORY') {
        categoryId = categoryMap.get(ing.sourceName.toLowerCase()) || null;
      } else if (ing.sourceType === 'INGREDIENT') {
        ingredientId = ingredientMap.get(ing.sourceName.toLowerCase()) || null;
      }

      // Preferred bottles for CATEGORY type
      const preferredBottleIds = (ing.preferredBottles || [])
        .map((pb) => bottleMap.get(pb.name.toLowerCase()))
        .filter(Boolean) as number[];

      return {
        quantity: ing.quantity,
        unitId: unitId || 0,
        sourceType,
        bottleId,
        categoryId,
        ingredientId,
        position: index,
        preferredBottles: preferredBottleIds.length > 0
          ? { create: preferredBottleIds.map((bid: number) => ({ bottleId: bid })) }
          : undefined,
      };
    });

    // 6. Create cocktail
    const cocktail = await tx.cocktail.create({
      data: {
        name: recipe.name,
        description: recipe.description || null,
        notes: recipe.notes || null,
        tags: Array.isArray(recipe.tags) ? recipe.tags.join(',') : '',
        isAvailable: true,
        ingredients: { create: ingredientsData },
        instructions: {
          create: (recipe.instructions || []).map((inst, index) => ({
            stepNumber: index + 1,
            text: inst.text,
          })),
        },
      },
      include: cocktailInclude,
    });

    return cocktail;
  });

  res.status(201).json(parseNameTranslations(result));
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

// Tags are stored as a comma-separated string
function toTagsString(tags: z.output<typeof Tags> | undefined): string {
  return Array.isArray(tags) ? tags.join(',') : (tags ?? '');
}

// Maps a validated ingredient line to a nested Prisma create. The array index gives the position.
function mapIngredient(ing: z.output<typeof IngredientLine>, index: number) {
  return {
    quantity: ing.quantity,
    unitId: ing.unitId,
    sourceType: ing.sourceType,
    bottleId: ing.bottleId ?? null,
    categoryId: ing.categoryId ?? null,
    ingredientId: ing.ingredientId ?? null,
    position: index,
    preferredBottles: ing.preferredBottleIds
      ? { create: ing.preferredBottleIds.map((bottleId) => ({ bottleId })) }
      : undefined,
  };
}

// Maps a validated instruction text to a nested Prisma create
function mapInstruction(text: string, index: number) {
  return { stepNumber: index + 1, text };
}

// Create cocktail
const createSchemas = { body: CocktailCreate };

router.post('/', validate(createSchemas), async (_req: AuthRequest, res: Response) => {
  const { name, description, notes, tags, isAvailable, ingredients, instructions } = valid<typeof createSchemas>(res).body;

  const cocktail = await prisma.cocktail.create({
    data: {
      name,
      description: description || null,
      notes: notes || null,
      tags: toTagsString(tags),
      isAvailable: isAvailable ?? true,
      ingredients: { create: (ingredients || []).map(mapIngredient) },
      instructions: { create: (instructions || []).map(mapInstruction) },
    },
    include: cocktailInclude,
  });

  res.status(201).json(parseNameTranslations(cocktail));
});

// Update cocktail. Only the fields present in the body are written, so a partial
// update such as { isAvailable: false } keeps the recipe. Ingredients and instructions
// are replaced through nested writes, which Prisma runs in a single transaction:
// if any part fails, the stored recipe is left untouched. A line may keep a defect the
// stored recipe already has (deleted source, quantity 0), but not add a new one.
const updateSchemas = { params: IdParams, body: CocktailUpdate };

router.put('/:id', validate(updateSchemas), async (_req: AuthRequest, res: Response) => {
  const { params: { id }, body } = valid<typeof updateSchemas>(res);
  const { name, description, notes, tags, isAvailable, ingredients, instructions } = body;
  if (ingredients) await refuseNewRecipeDefects(id, ingredients);

  // Absent fields are undefined, which Prisma leaves untouched
  const cocktail = await prisma.cocktail.update({
    where: { id },
    data: {
      name,
      description,
      notes,
      tags: tags === undefined ? undefined : toTagsString(tags),
      isAvailable,
      ...(ingredients && {
        ingredients: { deleteMany: {}, create: ingredients.map(mapIngredient) },
      }),
      ...(instructions && {
        instructions: { deleteMany: {}, create: instructions.map(mapInstruction) },
      }),
    },
    include: cocktailInclude,
  });

  res.json(parseNameTranslations(cocktail));
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
