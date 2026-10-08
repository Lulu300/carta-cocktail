import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Resolves the folder where uploaded images are stored.
 *
 * The default is relative to this file, so it is only right when running from
 * `src/` (dev with tsx). Compiled code lives in `dist/`, which is why the Docker
 * image sets UPLOAD_DIR to the mounted volume.
 */
export function resolveUploadDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UPLOAD_DIR) {
    return path.resolve(env.UPLOAD_DIR);
  }
  // Dev default: <repo>/uploads
  return path.resolve(__dirname, '../../uploads');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@carta.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  uploadDir: resolveUploadDir(),
};
