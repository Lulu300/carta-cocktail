import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const DEFAULT_ADMIN_EMAIL = 'admin@carta.local';
const MIN_ADMIN_PASSWORD_LENGTH = 12;
// The old default, published in this repository
const FORBIDDEN_ADMIN_PASSWORD = 'admin123';
const BCRYPT_COST = 12;
const INVALID_PASSWORD_MESSAGE =
  `ADMIN_PASSWORD must be set to at least ${MIN_ADMIN_PASSWORD_LENGTH} characters, other than '${FORBIDDEN_ADMIN_PASSWORD}', ` +
  'to create or reset the admin user';

export type EnsureAdminResult = 'created' | 'reset' | 'unchanged';

/**
 * Returns ADMIN_PASSWORD, or throws when it is missing or weak.
 * The strength rules are skipped for the test suite, which uses a short fixed password.
 */
function readAdminPassword(env: NodeJS.ProcessEnv): string {
  const password = env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(INVALID_PASSWORD_MESSAGE);
  }
  const isWeak = password.length < MIN_ADMIN_PASSWORD_LENGTH || password === FORBIDDEN_ADMIN_PASSWORD;
  if (env.NODE_ENV !== 'test' && isWeak) {
    throw new Error(INVALID_PASSWORD_MESSAGE);
  }
  return password;
}

async function credentialsFromEnv(env: NodeJS.ProcessEnv): Promise<{ email: string; passwordHash: string }> {
  const password = readAdminPassword(env);
  return {
    email: env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
  };
}

/**
 * Creates the admin user on first start. An existing admin is left untouched,
 * so a password changed from the settings page survives restarts; the
 * environment overrides it only when ADMIN_RESET_PASSWORD=true.
 */
export async function ensureAdmin(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnsureAdminResult> {
  const existingAdmin = await prisma.user.findFirst();

  if (!existingAdmin) {
    await prisma.user.create({ data: await credentialsFromEnv(env) });
    return 'created';
  }

  if (env.ADMIN_RESET_PASSWORD !== 'true') {
    return 'unchanged';
  }

  await prisma.user.update({
    where: { id: existingAdmin.id },
    data: await credentialsFromEnv(env),
  });
  console.log('Admin credentials reset from environment');
  return 'reset';
}
