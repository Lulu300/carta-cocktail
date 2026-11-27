import { Router, Response } from 'express';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { BadRequestError } from '../errors';
import {
  MAX_BACKUP_UPLOAD_BYTES,
  RESTORE_WORK_FOLDERS,
  beginExport,
  buildMetadata,
  createSnapshot,
  restoreBackup,
} from '../services/backupService';
import { apiDocs } from '../openapi/routeDoc';
import { BackupRestoreResult } from '../validation/backup';

const router = Router();
const doc = apiDocs('Backup');

const BACKUP_FIELD = 'backup';

// On disk rather than in memory: an archive can weigh hundreds of megabytes
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_BACKUP_UPLOAD_BYTES, files: 1 },
});

/**
 * Runs `callback` when the response closes, or right away when it already has:
 * the client may leave during an await (authentication, database copy), and
 * `close` is not emitted twice.
 */
function whenClosed(res: Response, callback: () => void): void {
  if (res.closed) callback();
  else res.on('close', callback);
}

router.get(
  '/export',
  doc({
    operationId: 'exportBackup',
    summary: 'Download a backup',
    description:
      'A ZIP archive of the database and the photos, streamed. Backups allow 10 requests in 15 minutes.',
    responses: {
      200: {
        description: 'The archive, `backup-<date>.zip`.',
        content: { 'application/zip': 'binary' },
        headers: { 'Content-Disposition': 'attachment; filename=backup-<yyyy-mm-dd>.zip' },
      },
    },
    errors: { 409: 'A restore is running.' },
  }),
  async (_req: AuthRequest, res: Response) => {
    // Taken before the first await. Ended when the response closes, not when this
    // handler returns: the archive reads the photos while it is being sent, and
    // once a client leaves halfway, the archive stays paused and this handler
    // never returns.
    const endExport = beginExport();
    whenClosed(res, endExport);
    const metadata = await buildMetadata();
    const snapshotPath = await createSnapshot();
    whenClosed(res, () => fs.rmSync(snapshotPath, { force: true }));

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
      archive.glob(
        '**',
        { cwd: config.uploadDir, dot: true, skip: RESTORE_WORK_FOLDERS },
        { prefix: 'uploads' },
      );
    }

    await archive.finalize();
  },
);

router.post(
  '/import',
  doc({
    operationId: 'restoreBackup',
    summary: 'Restore a backup',
    description:
      'Replaces the database and the photos with those of the archive, and ends every session, this one included.',
    upload: {
      field: BACKUP_FIELD,
      description: 'A ZIP archive made by `GET /api/backup/export`.',
      maxBytes: MAX_BACKUP_UPLOAD_BYTES,
    },
    responses: { 200: BackupRestoreResult },
    errors: {
      400: 'No file, not a backup of this application, or a backup made by a newer version.',
      409: 'Another restore or an export is running.',
    },
  }),
  upload.single(BACKUP_FIELD),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new BadRequestError('errors.noFileUploaded');

    try {
      const { skippedFiles, restartRecommended } = await restoreBackup(req.file.path);
      res.json({ message: req.t('backup.restored'), skippedFiles, restartRecommended });
    } finally {
      fs.rmSync(req.file.path, { force: true });
    }
  },
);

export default router;
