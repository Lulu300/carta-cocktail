import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new BadRequestError();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('errors.invalidCredentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('errors.invalidCredentials');

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true },
  });
  if (!user) throw new NotFoundError();
  res.json(user);
});

export default router;
