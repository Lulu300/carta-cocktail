import { z } from 'zod';

export const SiteSettingsUpdate = z.object({
  siteName: z.string().optional(),
  siteIcon: z.string().optional(),
});

// An empty email keeps the current one, as before.
export const ProfileUpdate = z
  .object({
    email: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .refine((body) => !body.newPassword || Boolean(body.currentPassword), {
    path: ['currentPassword'],
    message: 'Required to set a new password',
  });
