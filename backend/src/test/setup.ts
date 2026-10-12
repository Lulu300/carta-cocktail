import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';
import { TEST_DATABASE_URL } from './testDatabase';

// Set env vars BEFORE any app imports. globalSetup.ts creates this database once per run.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'testpass123';
process.env.PORT = '0';
process.env.NODE_ENV = 'test';

// Uploads go to a throwaway folder so tests never write into <repo>/uploads
const testUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-uploads-'));
process.env.UPLOAD_DIR = testUploadDir;

afterAll(() => {
  fs.rmSync(testUploadDir, { recursive: true, force: true });
});
