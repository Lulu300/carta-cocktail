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

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@carta.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  uploadDir: resolveUploadDir(),
};
