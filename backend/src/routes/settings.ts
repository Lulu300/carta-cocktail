import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';

const router = Router();

// Get site settings
router.get('/', async (_req: AuthRequest, res: Response) => {
  let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.siteSettings.create({ data: { id: 1 } });
  }
  res.json(settings);
});

// Update site settings
router.put('/', async (req: AuthRequest, res: Response) => {
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
});

// Update admin profile
router.put('/profile', async (req: AuthRequest, res: Response) => {
  const { email, currentPassword, newPassword } = req.body;

  if (newPassword && !currentPassword) throw new BadRequestError();

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new NotFoundError();

  if (newPassword) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    // 400, not 401: the session is valid, only the submitted password is wrong.
    // A 401 would make the frontend log the admin out.
    if (!valid) throw new BadRequestError('errors.invalidCurrentPassword');
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
});

export default router;
