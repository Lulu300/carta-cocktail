import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword, needsRehash, verifyPassword } from '../bootstrap/password';
import { authenticatedUserId, authMiddleware, AuthRequest, signToken } from '../middleware/auth';
import { NotFoundError, UnauthorizedError } from '../errors';
import { apiDocs } from '../openapi/routeDoc';
import { valid, validate } from '../validation/validate';
import { LoginBody, LoginResponse, User } from '../validation/auth';
import { MessageResponse } from '../validation/common';

const router = Router();
const doc = apiDocs('Auth');

const loginSchemas = { body: LoginBody };

/**
 * Brings a password hash made at another cost up to the current one. The password
 * is known only after a successful login. This is an improvement only: a failed
 * write (database busy or read-only) must not fail a correct login.
 */
async function upgradePasswordHash(userId: number, password: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
  } catch (err) {
    console.warn('Could not rehash the admin password at the current bcrypt cost:', err);
  }
}

router.post(
  '/login',
  doc({
    operationId: 'login',
    summary: 'Sign in',
    description:
      'Answers a session token for the `Authorization: Bearer` header. Failed attempts are limited per client address (`LOGIN_RATE_LIMIT` in 15 minutes).',
    responses: { 200: LoginResponse },
    errors: { 401: 'Unknown email or wrong password.' },
  }),
  validate(loginSchemas),
  async (_req: Request, res: Response) => {
    const { email, password } = valid<typeof loginSchemas>(res).body;

    const user = await prisma.user.findUnique({ where: { email } });
    // Runs bcrypt even for an unknown email: the response time must not tell which emails exist
    const isPasswordValid = await verifyPassword(password, user?.passwordHash);
    if (!user || !isPasswordValid) throw new UnauthorizedError('errors.invalidCredentials');

    if (needsRehash(user.passwordHash)) {
      await upgradePasswordHash(user.id, password);
    }

    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  },
);

router.get(
  '/me',
  doc({
    operationId: 'getCurrentUser',
    summary: 'Get the signed-in admin',
    description: 'Also tells whether the session token is still valid.',
    responses: { 200: User },
    errors: { 404: 'The admin of the token no longer exists.' },
  }),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundError();
    res.json(user);
  },
);

// Revokes every session of the user, including the one sending this request, and deletes
// every API token (decision of 2026-11-27, F-16): the confirmation in Settings says so.
// API tokens cannot call it (SESSION_ONLY_ROUTES in app.ts).
router.post(
  '/logout-all',
  doc({
    operationId: 'logoutEverywhere',
    summary: 'Sign out everywhere',
    description:
      'Revokes every session token of the admin, the one sending this request included, and deletes every API token.',
    responses: { 200: MessageResponse },
  }),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
      prisma.apiToken.deleteMany({ where: { userId } }),
    ]);
    res.json({ message: req.t('auth.loggedOutEverywhere') });
  },
);

export default router;
