import { Router, Response } from 'express';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from '../config';
import { checkpointWal, configureSqlite, prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError } from '../errors';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || '';
  // DATABASE_URL format: "file:/path/to/db.db"
  return dbUrl.replace(/^file:/, '');
}

/** Opens the uploaded archive: a file that is not a readable zip is a client error. */
function openBackupZip(buffer: Buffer): AdmZip {
  try {
    return new AdmZip(buffer);
  } catch {
    throw new BadRequestError('errors.invalidBackup');
  }
}

// Export backup as ZIP
router.get('/export', async (_req: AuthRequest, res: Response) => {
  const dbPath = getDatabasePath();
  const uploadsDir = config.uploadDir;

  if (!fs.existsSync(dbPath)) {
    res.status(500).json({ error: 'Database file not found' });
    return;
  }

  // In WAL mode the latest writes may still be in the -wal file only
  await checkpointWal();

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=backup-${date}.zip`);

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Stream errors are emitted outside the handler's promise, so Express never sees them
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Backup failed' });
    }
  });

  archive.pipe(res);

  // Add metadata
  const metadata = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: '1.0.0',
  });
  archive.append(metadata, { name: 'metadata.json' });

  archive.file(dbPath, { name: 'database.db' });

  // Add uploads directory if it exists
  if (fs.existsSync(uploadsDir)) {
    archive.directory(uploadsDir, 'uploads');
  }

  await archive.finalize();
});

// Import backup from ZIP
router.post('/import', upload.single('backup'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const zip = openBackupZip(req.file.buffer);
  const entries = zip.getEntries();

  // Validate ZIP contents
  const hasMetadata = entries.some((e) => e.entryName === 'metadata.json');
  const hasDatabase = entries.some((e) => e.entryName === 'database.db');

  if (!hasMetadata || !hasDatabase) throw new BadRequestError('errors.invalidBackup');

  // Validate metadata
  const metadataEntry = zip.getEntry('metadata.json');
  if (!metadataEntry) throw new BadRequestError('errors.invalidBackup');

  const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
  if (metadata.version !== 1) throw new BadRequestError('errors.invalidBackup');

  const dbPath = getDatabasePath();
  const uploadsDir = config.uploadDir;

  // Replace database file
  const dbEntry = zip.getEntry('database.db');
  if (!dbEntry) throw new BadRequestError('errors.invalidBackup');
  // Open connections would keep reading the old WAL and later checkpoint
  // its pages over the restored file: flush it and close them all first
  await checkpointWal();
  await prisma.$disconnect();
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  fs.writeFileSync(dbPath, dbEntry.getData());
  // Reconnects and applies the journal mode to the restored file
  await configureSqlite();

  // Clear and restore uploads directory
  if (fs.existsSync(uploadsDir)) {
    const existingFiles = fs.readdirSync(uploadsDir);
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }
  } else {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Extract upload files
  for (const entry of entries) {
    if (entry.entryName.startsWith('uploads/') && !entry.isDirectory) {
      const fileName = path.basename(entry.entryName);
      if (fileName) {
        fs.writeFileSync(path.join(uploadsDir, fileName), entry.getData());
      }
    }
  }

  res.json({ success: true, message: 'Backup restored successfully' });
});

export default router;
