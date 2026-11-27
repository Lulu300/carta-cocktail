import { z } from 'zod';
import { User } from './auth';
import { Id } from './common';

export const SiteSettingsUpdate = z.object({
  siteName: z.string().optional(),
  siteIcon: z.string().optional(),
});

// An empty email keeps the current one, as before. Changing the login email or
// the password takes the current password: a stolen token alone must not be
// enough to take the account over.
export const ProfileUpdate = z
  .object({
    email: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .refine((body) => !(body.email || body.newPassword) || Boolean(body.currentPassword), {
    path: ['currentPassword'],
    message: 'Required to change the email or the password',
  });

/** Checked by the route, which answers with a translated message rather than a validation error. */
export const EmailAddress = z.email();

/** The site name and icon, as the public settings route sends them. */
export const SiteSettings = z.strictObject({
  siteName: z.string(),
  siteIcon: z.string(),
});

/** The settings row, as the admin settings routes send it. */
export const SiteSettingsRow = SiteSettings.extend({ id: Id });

/** Answer of a profile update. `token` comes when the password changed: the previous one is revoked. */
export const ProfileResponse = User.extend({ token: z.string().optional() });
