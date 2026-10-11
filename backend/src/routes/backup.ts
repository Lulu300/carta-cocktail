import { Router, Response } from 'express';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError } from '../errors';
import {
  MAX_BACKUP_UPLOAD_BYTES, buildMetadata, createSnapshot, restoreBackup,
} from '../services/backupService';

const router = Router();

// On disk rather than in memory: an archive can weigh hundreds of megabytes
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_BACKUP_UPLOAD_BYTES, files: 1 },
});

// Export backup as ZIP
router.get('/export', async (_req: AuthRequest, res: Response) => {
  const metadata = await buildMetadata();
  const snapshotPath = await createSnapshot();
  res.on('close', () => fs.rmSync(snapshotPath, { force: true }));

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=backup-${date}.zip`);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  // Stream errors are emitted outside the handler's promise, so Express never sees
  // them. The zip is already partly sent: cut the connection so the client gets a
  // failed download instead of a truncated file it would take for a valid backup.
  archive.on('error', (err) => {
    console.error('Backup export failed:', err);
    res.destroy(err);
  });
  archive.pipe(res);

  archive.append(JSON.stringify(metadata), { name: 'metadata.json' });
  archive.file(snapshotPath, { name: 'database.db' });
  if (fs.existsSync(config.uploadDir)) {
    archive.directory(config.uploadDir, 'uploads');
  }

  await archive.finalize();
});

// Import backup from ZIP
router.post('/import', upload.single('backup'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new BadRequestError('errors.noFileUploaded');

  try {
    const { skippedFiles, restartRecommended } = await restoreBackup(req.file.path);
    res.json({ message: req.t('backup.restored'), skippedFiles, restartRecommended });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});

export default router;
