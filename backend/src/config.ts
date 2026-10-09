import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Resolves the folder where uploaded images are stored.
 *
 * The default is relative to this file and assumes the repository layout
 * (`<repo>/backend/{src,dist}`), so it gives `<repo>/uploads`. In the Docker
 * image the backend sits directly in `/app`, where the default would be
 * `/uploads`, outside the volume: that is why the image sets UPLOAD_DIR.
 */
export function resolveUploadDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UPLOAD_DIR) {
    return path.resolve(env.UPLOAD_DIR);
  }
  // Dev default: <repo>/uploads
  return path.resolve(__dirname, '../../uploads');
}

const MIN_JWT_SECRET_LENGTH = 32;

// Values published in this public repository (old defaults, docs, test setup):
// anyone could forge admin tokens with them.
const WEAK_SECRETS = ['default-secret', 'change-me-to-a-random-secret', 'your-random-secret', 'test-secret'];

/**
 * Returns the JWT secret, or throws when it is missing or guessable.
 * The check is skipped only for the test suite, which uses a fixed secret.
 */
export function assertJwtSecret(secret: string | undefined, nodeEnv: string | undefined): string {
  if (nodeEnv === 'test') {
    return secret ?? '';
  }
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH || WEAK_SECRETS.includes(secret)) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)');
  }
  return secret;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: assertJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV),
  uploadDir: resolveUploadDir(),
};
