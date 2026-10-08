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
 * Only the exact value 'true' triggers a reset. Any other non-empty value except
 * 'false' (the compose default) is logged, so a typo such as '1' or 'TRUE'
 * does not fail silently while someone is recovering a lost password.
 */
function isResetRequested(env: NodeJS.ProcessEnv): boolean {
  const flag = env.ADMIN_RESET_PASSWORD;
  if (flag === 'true') {
    return true;
  }
  if (flag && flag !== 'false') {
    console.warn(`ADMIN_RESET_PASSWORD='${flag}' is ignored: set it to exactly 'true' to reset the admin credentials`);
  }
  return false;
}

// Instances that never set ADMIN_PASSWORD were seeded with the old default at
// every start. They are not overwritten, but the operator must know.
async function warnIfDefaultPassword(passwordHash: string): Promise<void> {
  if (await bcrypt.compare(FORBIDDEN_ADMIN_PASSWORD, passwordHash)) {
    console.warn(
      `WARNING: the admin password is still the old default '${FORBIDDEN_ADMIN_PASSWORD}'. ` +
      'Change it in Settings > Profile, or set ADMIN_RESET_PASSWORD=true with a new ADMIN_PASSWORD ' +
      'for one restart, then remove the flag.',
    );
  }
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

  if (!isResetRequested(env)) {
    await warnIfDefaultPassword(existingAdmin.passwordHash);
    return 'unchanged';
  }

  const credentials = await credentialsFromEnv(env);
  await prisma.user.update({ where: { id: existingAdmin.id }, data: credentials });
  console.log(`Admin credentials reset from environment (login email: ${credentials.email})`);
  return 'reset';
}
