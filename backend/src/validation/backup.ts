import { z } from 'zod';

// Responses of routes/backup.ts. The export answers a ZIP archive, not JSON.

export const BackupRestoreResult = z.strictObject({
  message: z.string(),
  /** Files of uploads/ that were not restored: not an image, or a file name already restored. */
  skippedFiles: z.number().int(),
  /** The backup has an older database schema: the backend applies the missing migrations when it restarts. */
  restartRecommended: z.boolean(),
});
