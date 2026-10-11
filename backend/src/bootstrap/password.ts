import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * The one password rule of the application: ADMIN_PASSWORD at startup and a
 * password changed from the settings page are held to the same length and cost.
 */
export const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * True for a hash made at another cost: the old seed and the settings page used
 * cost 10 before this rule. Such a hash must be redone at the next login, or the
 * check of a known email would be faster than the dummy check of an unknown one.
 */
export function needsRehash(passwordHash: string): boolean {
  return bcrypt.getRounds(passwordHash) !== BCRYPT_COST;
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash of a random password, compared against when a login names an unknown
 * email, so that the answer takes as long as for a wrong password. Computed on
 * first use rather than at import: hashing at cost 12 blocks for a few hundred
 * milliseconds, which every test file would pay.
 */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

/**
 * Checks a password against a stored hash. Without a hash (unknown user) it
 * still runs a full bcrypt comparison, then answers false.
 */
export async function verifyPassword(password: string, passwordHash: string | undefined): Promise<boolean> {
  if (passwordHash === undefined) {
    await bcrypt.compare(password, await getDummyHash());
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
