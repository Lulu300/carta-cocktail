import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword, needsRehash, verifyPassword } from '../bootstrap/password';
import { authMiddleware, AuthRequest, signToken } from '../middleware/auth';
import { NotFoundError, UnauthorizedError } from '../errors';
import { valid, validate } from '../validation/validate';
import { LoginBody } from '../validation/auth';

const router = Router();

const loginSchemas = { body: LoginBody };

/**
 * Brings a password hash made at another cost up to the current one. The password
 * is known only after a successful login. This is an improvement only: a failed
 * write (database busy or read-only) must not fail a correct login.
 */
async function upgradePasswordHash(userId: number, password: string): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  } catch (err) {
    console.warn('Could not rehash the admin password at the current bcrypt cost:', err);
  }
}

router.post('/login', validate(loginSchemas), async (_req: Request, res: Response) => {
  const { email, password } = valid<typeof loginSchemas>(res).body;

  const user = await prisma.user.findUnique({ where: { email } });
  // Runs bcrypt even for an unknown email: the response time must not tell which emails exist
  const isPasswordValid = await verifyPassword(password, user?.passwordHash);
  if (!user || !isPasswordValid) throw new UnauthorizedError('errors.invalidCredentials');

  if (needsRehash(user.passwordHash)) {
    await upgradePasswordHash(user.id, password);
  }

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
