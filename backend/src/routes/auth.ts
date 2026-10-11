import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { NotFoundError, UnauthorizedError } from '../errors';
import { valid, validate } from '../validation/validate';
import { LoginBody } from '../validation/auth';

const router = Router();

const loginSchemas = { body: LoginBody };

router.post('/login', validate(loginSchemas), async (_req: Request, res: Response) => {
  const { email, password } = valid<typeof loginSchemas>(res).body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('errors.invalidCredentials');

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) throw new UnauthorizedError('errors.invalidCredentials');

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
