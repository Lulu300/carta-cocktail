import { z } from 'zod';
import { Id } from './common';

export const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

/** The admin, as the auth and profile routes send it: never its password hash. */
export const User = z.strictObject({
  id: Id,
  email: z.string(),
});

export const LoginResponse = z.strictObject({
  token: z.string(),
  user: User,
});
