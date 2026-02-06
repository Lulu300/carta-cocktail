import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';

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

// List all cocktails
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const cocktails = await prisma.cocktail.findMany({
      include: cocktailIncludes,
      orderBy: { name: 'asc' },
    });
    res.json(cocktails);
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
    res.json(cocktail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Create cocktail
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, notes, isAvailable, ingredients, instructions } = req.body;
    if (!name) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const cocktail = await prisma.cocktail.create({
      data: {
        name,
        description: description || null,
        notes: notes || null,
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

    res.status(201).json(cocktail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update cocktail
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { name, description, notes, isAvailable, ingredients, instructions } = req.body;

    // Delete existing ingredients and instructions to recreate
    await prisma.cocktailIngredient.deleteMany({ where: { cocktailId: id } });
    await prisma.cocktailInstruction.deleteMany({ where: { cocktailId: id } });

    const cocktail = await prisma.cocktail.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
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

    res.json(cocktail);
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
