import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { Cocktail } from '../../generated/prisma/client';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../errors';

/** Accepted image extensions and the only MIME type each one may come with. */
const IMAGE_MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function extensionOf(file: Express.Multer.File): string {
  return path.extname(file.originalname).toLowerCase();
}

function isAcceptedImage(file: Express.Multer.File): boolean {
  return IMAGE_MIME_TYPES.get(extensionOf(file)) === file.mimetype;
}

/** Multer middleware for a cocktail photo. A refused file leaves `req.file` empty. */
export const imageUpload = multer({
  storage: multer.diskStorage({
    // Runs outside the handler's promise: the error goes back through multer's callback
    destination: (_req, _file, cb) => {
      fs.mkdir(config.uploadDir, { recursive: true }, (error) => cb(error, config.uploadDir));
    },
    // A random name: the client's file name never reaches the disk
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + extensionOf(file)),
  }),
  fileFilter: (_req, file, cb) => cb(null, isAcceptedImage(file)),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

/**
 * Path of a stored photo. Only the base name is kept, so an `imagePath` such as
 * `../../etc/passwd` (from a crafted backup) cannot point outside the upload folder.
 */
export function safeUploadPath(imagePath: string): string {
  return path.join(config.uploadDir, path.basename(imagePath));
}

// Best effort: a file left behind costs some disk space, while failing here would
// report an error for a database change that already happened.
async function deleteFileQuietly(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.warn(`[uploads] Could not delete ${filePath}: ${code ?? error}`);
  }
}

/** Deletes a stored photo, if it is still there. Never throws. */
export function removeImageFile(imagePath: string): Promise<void> {
  return deleteFileQuietly(safeUploadPath(imagePath));
}

/**
 * Stores the uploaded file as the cocktail's photo, then deletes the previous one.
 * If the cocktail does not exist or the update fails, the uploaded file is deleted.
 */
export async function setImage(id: number, file: Express.Multer.File): Promise<Cocktail> {
  let result: { cocktail: Cocktail; previousImagePath: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      const existing = await tx.cocktail.findUnique({ where: { id }, select: { imagePath: true } });
      if (!existing) throw new NotFoundError();
      const cocktail = await tx.cocktail.update({ where: { id }, data: { imagePath: file.filename } });
      return { cocktail, previousImagePath: existing.imagePath };
    });
  } catch (error) {
    await deleteFileQuietly(file.path);
    throw error;
  }
  if (result.previousImagePath) await removeImageFile(result.previousImagePath);
  return result.cocktail;
}
