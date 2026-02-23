import { Router, Response } from 'express';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';

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

// Export backup as ZIP
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const dbPath = getDatabasePath();
    const uploadsDir = config.uploadDir;

    if (!fs.existsSync(dbPath)) {
      res.status(500).json({ error: 'Database file not found' });
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=backup-${date}.zip`);

    const archive = archiver('zip', { zlib: { level: 6 } });

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

    // Add database file
    archive.file(dbPath, { name: 'database.db' });

    // Add uploads directory if it exists
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    await archive.finalize();
  } catch (error) {
    console.error('Backup export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: req.t('errors.serverError') });
    }
  }
});

// Import backup from ZIP
router.post('/import', upload.single('backup'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    // Validate ZIP contents
    const hasMetadata = entries.some((e) => e.entryName === 'metadata.json');
    const hasDatabase = entries.some((e) => e.entryName === 'database.db');

    if (!hasMetadata || !hasDatabase) {
      res.status(400).json({ error: req.t('errors.invalidBackup') });
      return;
    }

    // Validate metadata
    const metadataEntry = zip.getEntry('metadata.json');
    if (!metadataEntry) {
      res.status(400).json({ error: req.t('errors.invalidBackup') });
      return;
    }

    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
    if (metadata.version !== 1) {
      res.status(400).json({ error: req.t('errors.invalidBackup') });
      return;
    }

    const dbPath = getDatabasePath();
    const uploadsDir = config.uploadDir;

    // Replace database file
    const dbEntry = zip.getEntry('database.db');
    if (!dbEntry) {
      res.status(400).json({ error: req.t('errors.invalidBackup') });
      return;
    }
    fs.writeFileSync(dbPath, dbEntry.getData());

    // Remove WAL and journal files if they exist
    const walPath = dbPath + '-wal';
    const journalPath = dbPath + '-journal';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);

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
  } catch (error) {
    console.error('Backup import error:', error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
