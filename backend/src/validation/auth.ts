import { z } from 'zod';

export const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
