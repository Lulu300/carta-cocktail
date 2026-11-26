/*
 * Largest file the backend accepts for each upload, this size included. A larger file is
 * refused before it is sent, so that every browser shows the same message: past nginx's own
 * limit, nginx answers 413 while the file is still being sent, and Firefox does not read that
 * answer. It sends the file again until it gives up and shows a network error.
 */

/** MAX_BACKUP_UPLOAD_BYTES in backend/src/services/backupService.ts, keep both in line. nginx allows 210 MB. */
export const MAX_BACKUP_UPLOAD_BYTES = 200 * 1024 * 1024;

/** MAX_IMAGE_BYTES in backend/src/services/cocktail/cocktailImage.ts, keep both in line. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** MAX_BOTTLE_IMPORT_BYTES in backend/src/utils/bottlesImport.ts, keep both in line. */
export const MAX_BOTTLE_IMPORT_BYTES = 10 * 1024 * 1024;

export function exceedsUploadLimit(file: File, maxBytes: number): boolean {
  return file.size > maxBytes;
}
