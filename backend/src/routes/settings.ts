import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get site settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.siteSettings.create({ data: { id: 1 } });
    }
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update site settings
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const { siteName, siteIcon } = req.body;
    const settings = await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {
        ...(siteName !== undefined && { siteName }),
        ...(siteIcon !== undefined && { siteIcon }),
      },
      create: {
        id: 1,
        ...(siteName !== undefined && { siteName }),
        ...(siteIcon !== undefined && { siteIcon }),
      },
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Update admin profile
router.put('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (newPassword && !currentPassword) {
      res.status(400).json({ error: req.t('errors.validationError') });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }

    if (newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: req.t('errors.invalidCredentials') });
        return;
      }
    }

    const updateData: { email?: string; passwordHash?: string } = {};
    if (email) {
      updateData.email = email;
    }
    if (newPassword) {
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: { id: true, email: true },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
