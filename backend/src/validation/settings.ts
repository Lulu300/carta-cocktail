import { z } from 'zod';
import { User } from './auth';

export const SiteSettingsUpdate = z.object({
  siteName: z.string().optional(),
  siteIcon: z.string().optional(),
  // Checked one by one by the route, which names the refused origin in a translated message
  embedOrigins: z.array(z.string()).optional(),
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

/** The settings as the admin routes send them (GET and PUT /api/settings). */
export const AdminSiteSettings = SiteSettings.extend({
  id: z.number().int(),
  /** Sites allowed to show the public menu in an iframe, e.g. "https://www.mon-bar.fr". */
  embedOrigins: z.array(z.string()),
});

/** Answer of a profile update. `token` comes when the password changed: the previous one is revoked. */
export const ProfileResponse = User.extend({ token: z.string().optional() });
