import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';
import { parseNameTranslations } from '../utils/translations';

const parseNT = (val: any) => {
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val || null;
};

const router = Router();
const prisma = new PrismaClient();

// Multer config for image upload
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    cb(null, ext && mime);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const cocktailIncludes = {
  ingredients: {
    include: {
      unit: true,
      bottle: { include: { category: true } },
      category: true,
      ingredient: true,
      preferredBottles: { include: { bottle: true } },
    },
    orderBy: { position: 'asc' as const },
  },
  instructions: { orderBy: { stepNumber: 'asc' as const } },
};

// Helper: transform a cocktail DB object into the portable export format
function buildExportPayload(cocktail: any) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cocktail: {
      name: cocktail.name,
      description: cocktail.description || null,
      notes: cocktail.notes || null,
      tags: cocktail.tags ? cocktail.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      ingredients: (cocktail.ingredients || []).map((ing: any) => {
        let sourceName = '';
        let sourceDetail: any = {};

        if (ing.sourceType === 'BOTTLE' && ing.bottle) {
          sourceName = ing.bottle.name;
          sourceDetail = {
            categoryName: ing.bottle.category?.name || '',
            categoryType: ing.bottle.category?.type || 'SPIRIT',
            categoryNameTranslations: parseNT(ing.bottle.category?.nameTranslations),
          };
        } else if (ing.sourceType === 'CATEGORY' && ing.category) {
          sourceName = ing.category.name;
          sourceDetail = {
            type: ing.category.type,
            desiredStock: ing.category.desiredStock,
            nameTranslations: parseNT(ing.category.nameTranslations),
          };
        } else if (ing.sourceType === 'INGREDIENT' && ing.ingredient) {
          sourceName = ing.ingredient.name;
          sourceDetail = {
            icon: ing.ingredient.icon || null,
            nameTranslations: parseNT(ing.ingredient.nameTranslations),
          };
        }

        return {
          sourceType: ing.sourceType,
          sourceName,
          sourceDetail,
          quantity: ing.quantity,
          unit: ing.unit
            ? {
                name: ing.unit.name,
                abbreviation: ing.unit.abbreviation,
                conversionFactorToMl: ing.unit.conversionFactorToMl,
                nameTranslations: parseNT(ing.unit.nameTranslations),
              }
            : null,
          position: ing.position,
          preferredBottles: (ing.preferredBottles || []).map((pb: any) => ({
            name: pb.bottle?.name || '',
            categoryName: pb.bottle?.category?.name || ing.category?.name || '',
          })),
        };
      }),
      instructions: (cocktail.instructions || []).map((inst: any) => ({
        stepNumber: inst.stepNumber,
        text: inst.text,
      })),
    },
  };
}

// Export cocktail as JSON
router.get('/:id/export', async (req: AuthRequest, res: Response) => {
  try {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: cocktailIncludes,
    });
    if (!cocktail) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    const payload = buildExportPayload(cocktail);
    const slug = cocktail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="cocktail-${slug}.json"`);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Import preview: analyze JSON and return matched/missing entities
router.post('/import/preview', async (req: AuthRequest, res: Response) => {
  try {
    const data = req.body;

    if (!data || data.version !== 1 || !data.cocktail?.name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const recipe = data.cocktail;

    // Check if cocktail name already exists
    const existingCocktail = await prisma.cocktail.findFirst({
      where: { name: { equals: recipe.name } },
    });

    // Collect unique referenced entities
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Import confirm: create missing entities + cocktail in a transaction
router.post('/import/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { recipe: data, resolutions } = req.body;

    if (!data || data.version !== 1 || !data.cocktail?.name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const recipe = data.cocktail;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve units
      const unitMap = new Map<string, number>(); // abbreviation (lowercase) -> id
      for (const [key, resolution] of Object.entries(resolutions?.units || {})) {
        const r = resolution as any;
        if (r.action === 'use_existing' && r.existingId) {
          unitMap.set(key.toLowerCase(), r.existingId);
        } else if (r.action === 'create' && r.data) {
          const { nameTranslations, ...rest } = r.data;
          const created = await tx.unit.create({ data: { ...rest, nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null } });
          unitMap.set(key.toLowerCase(), created.id);
        }
      }

      // 2. Resolve categories
      const categoryMap = new Map<string, number>(); // name (lowercase) -> id
      for (const [key, resolution] of Object.entries(resolutions?.categories || {})) {
        const r = resolution as any;
        if (r.action === 'use_existing' && r.existingId) {
          categoryMap.set(key.toLowerCase(), r.existingId);
        } else if (r.action === 'create' && r.data) {
          const { nameTranslations, ...rest } = r.data;
          const created = await tx.category.create({ data: { ...rest, nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null } });
          categoryMap.set(key.toLowerCase(), created.id);
        }
      }

      // 3. Resolve bottles
      const bottleMap = new Map<string, number>(); // name (lowercase) -> id
      for (const [key, resolution] of Object.entries(resolutions?.bottles || {})) {
        const r = resolution as any;
        if (r.action === 'use_existing' && r.existingId) {
          bottleMap.set(key.toLowerCase(), r.existingId);
        } else if (r.action === 'create' && r.data) {
          // Resolve category for this bottle
          const catId = r.data.categoryName
            ? categoryMap.get(r.data.categoryName.toLowerCase())
            : null;
          if (!catId) continue; // skip if category not resolved
          const { categoryName, ...bottleData } = r.data;
          const created = await tx.bottle.create({
            data: { ...bottleData, categoryId: catId },
          });
          bottleMap.set(key.toLowerCase(), created.id);
        }
        // 'skip' action: do nothing, bottle will not be in the map
      }

      // 4. Resolve ingredients
      const ingredientMap = new Map<string, number>(); // name (lowercase) -> id
      for (const [key, resolution] of Object.entries(resolutions?.ingredients || {})) {
        const r = resolution as any;
        if (r.action === 'use_existing' && r.existingId) {
          ingredientMap.set(key.toLowerCase(), r.existingId);
        } else if (r.action === 'create' && r.data) {
          const { nameTranslations, ...rest } = r.data;
          const created = await tx.ingredient.create({ data: { ...rest, nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null } });
          ingredientMap.set(key.toLowerCase(), created.id);
        }
      }

      // 5. Build cocktail ingredients
      const ingredientsData = (recipe.ingredients || []).map((ing: any, index: number) => {
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
          .map((pb: any) => bottleMap.get(pb.name.toLowerCase()))
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
            create: (recipe.instructions || []).map((inst: any, index: number) => ({
              stepNumber: index + 1,
              text: inst.text,
            })),
          },
        },
        include: cocktailIncludes,
      });

      return cocktail;
    });

    res.status(201).json(parseNameTranslations(result));
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      res.status(409).json({ error: req.t('errors.duplicateEntry') });
      return;
    }
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// List all cocktails
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const cocktails = await prisma.cocktail.findMany({
      include: cocktailIncludes,
      orderBy: { name: 'asc' },
    });
    res.json(parseNameTranslations(cocktails));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get one cocktail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
      include: cocktailIncludes,
    });
    if (!cocktail) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.json(parseNameTranslations(cocktail));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Create cocktail
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, notes, tags, isAvailable, ingredients, instructions } = req.body;
    const tagsString = Array.isArray(tags) ? tags.join(',') : (tags || '');
    if (!name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const cocktail = await prisma.cocktail.create({
      data: {
        name,
        description: description || null,
        notes: notes || null,
        tags: tagsString,
        isAvailable: isAvailable ?? true,
        ingredients: {
          create: (ingredients || []).map((ing: any, index: number) => ({
            quantity: ing.quantity,
            unitId: ing.unitId,
            sourceType: ing.sourceType,
            bottleId: ing.bottleId || null,
            categoryId: ing.categoryId || null,
            ingredientId: ing.ingredientId || null,
            position: index,
            preferredBottles: ing.preferredBottleIds
              ? { create: ing.preferredBottleIds.map((bid: number) => ({ bottleId: bid })) }
              : undefined,
          })),
        },
        instructions: {
          create: (instructions || []).map((inst: any, index: number) => ({
            stepNumber: index + 1,
            text: inst.text || inst,
          })),
        },
      },
      include: cocktailIncludes,
    });

    res.status(201).json(parseNameTranslations(cocktail));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update cocktail
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { name, description, notes, tags, isAvailable, ingredients, instructions } = req.body;
    const tagsString = Array.isArray(tags) ? tags.join(',') : (tags ?? '');

    // Delete existing ingredients and instructions to recreate
    await prisma.cocktailIngredient.deleteMany({ where: { cocktailId: id } });
    await prisma.cocktailInstruction.deleteMany({ where: { cocktailId: id } });

    const cocktail = await prisma.cocktail.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
        tags: tagsString,
        ...(isAvailable !== undefined && { isAvailable }),
        ingredients: ingredients
          ? {
              create: ingredients.map((ing: any, index: number) => ({
                quantity: ing.quantity,
                unitId: ing.unitId,
                sourceType: ing.sourceType,
                bottleId: ing.bottleId || null,
                categoryId: ing.categoryId || null,
                ingredientId: ing.ingredientId || null,
                position: index,
                preferredBottles: ing.preferredBottleIds
                  ? { create: ing.preferredBottleIds.map((bid: number) => ({ bottleId: bid })) }
                  : undefined,
              })),
            }
          : undefined,
        instructions: instructions
          ? {
              create: instructions.map((inst: any, index: number) => ({
                stepNumber: index + 1,
                text: inst.text || inst,
              })),
            }
          : undefined,
      },
      include: cocktailIncludes,
    });

    res.json(parseNameTranslations(cocktail));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Delete cocktail
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const cocktail = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
    });
    // Delete image if exists
    if (cocktail?.imagePath) {
      const imagePath = path.join(config.uploadDir, cocktail.imagePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await prisma.cocktail.delete({ where: { id: parseInt(String(req.params.id)) } });
    res.json({ message: req.t('cocktails.deleted') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Upload image
router.post('/:id/image', upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    // Delete old image if exists
    const existing = await prisma.cocktail.findUnique({
      where: { id: parseInt(String(req.params.id)) },
    });
    if (existing?.imagePath) {
      const oldPath = path.join(config.uploadDir, existing.imagePath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const cocktail = await prisma.cocktail.update({
      where: { id: parseInt(String(req.params.id)) },
      data: { imagePath: req.file.filename },
    });

    res.json(cocktail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
