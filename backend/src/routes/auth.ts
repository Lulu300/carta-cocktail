import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../bootstrap/password';
import { authMiddleware, AuthRequest, signToken } from '../middleware/auth';
import { NotFoundError, UnauthorizedError } from '../errors';
import { valid, validate } from '../validation/validate';
import { LoginBody } from '../validation/auth';

const router = Router();

const loginSchemas = { body: LoginBody };

router.post('/login', validate(loginSchemas), async (_req: Request, res: Response) => {
  const { email, password } = valid<typeof loginSchemas>(res).body;

  const user = await prisma.user.findUnique({ where: { email } });
  // Runs bcrypt even for an unknown email: the response time must not tell which emails exist
  const isPasswordValid = await verifyPassword(password, user?.passwordHash);
  if (!user || !isPasswordValid) throw new UnauthorizedError('errors.invalidCredentials');

  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true },
  });
  if (!user) throw new NotFoundError();
  res.json(user);
});

// Revokes every token of the user, including the one sending this request
router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  res.json({ message: req.t('auth.loggedOutEverywhere') });
});

export default router;
