import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../bootstrap/password';
import { AuthRequest, signToken } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../errors';
import { valid, validate } from '../validation/validate';
import { EmailAddress, ProfileUpdate, SiteSettingsUpdate } from '../validation/settings';
import { getOrCreateSettings, toSiteSettingsResponse } from '../services/settingsService';
import { serializeEmbedOrigins } from '../services/embedOrigins';

const router = Router();

// Get site settings
router.get('/', async (_req: AuthRequest, res: Response) => {
  res.json(toSiteSettingsResponse(await getOrCreateSettings()));
});

// Update site settings
const siteSettingsSchemas = { body: SiteSettingsUpdate };

router.put('/', validate(siteSettingsSchemas), async (_req: AuthRequest, res: Response) => {
  const { siteName, siteIcon, embedOrigins } = valid<typeof siteSettingsSchemas>(res).body;
  // Absent fields are undefined, which Prisma leaves untouched
  const data = {
    siteName,
    siteIcon,
    embedOrigins: embedOrigins && serializeEmbedOrigins(embedOrigins),
  };
  const settings = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(toSiteSettingsResponse(settings));
});

// Update admin profile
const profileSchemas = { body: ProfileUpdate };

router.put('/profile', validate(profileSchemas), async (req: AuthRequest, res: Response) => {
  const { email, currentPassword, newPassword } = valid<typeof profileSchemas>(res).body;

  if (email && !EmailAddress.safeParse(email).success)
    throw new BadRequestError('errors.invalidEmail');
  // New passwords only: a shorter password set before this rule still logs in
  if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH)
    throw new BadRequestError('errors.passwordTooShort');

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new NotFoundError();

  if (email || newPassword) {
    // The schema only accepts these changes together with the current password
    const isPasswordValid = await verifyPassword(currentPassword ?? '', user.passwordHash);
    // 400, not 401: the session is valid, only the submitted password is wrong.
    // A 401 would make the frontend log the admin out.
    if (!isPasswordValid) throw new BadRequestError('errors.invalidCurrentPassword');
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      // Absent fields are undefined, which Prisma leaves untouched
      email: email || undefined,
      passwordHash: newPassword ? await hashPassword(newPassword) : undefined,
      // A new password revokes every token issued before it
      tokenVersion: newPassword ? { increment: 1 } : undefined,
    },
    select: { id: true, email: true, tokenVersion: true },
  });

  const profile = { id: updatedUser.id, email: updatedUser.email };
  // The token that sent this request is now revoked: hand over a new one
  res.json(newPassword ? { ...profile, token: signToken(updatedUser) } : profile);
});

export default router;
