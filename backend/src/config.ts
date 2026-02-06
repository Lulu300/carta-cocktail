import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@carta.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  uploadDir: path.resolve(__dirname, '../../uploads'),
};
