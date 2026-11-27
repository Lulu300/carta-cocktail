import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { Cocktail } from '../../generated/prisma/client';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../errors';
import { derivedVariantNames, safeUploadPath, storeUploadedImage } from './imageVariants';

/** Accepted image extensions and the only MIME type each one may come with. */
const IMAGE_MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

/** Largest cocktail photo accepted, this size included (multer's fileSize, see backend/AGENTS.md). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The media types of the photos a cocktail accepts, each with its file extension. */
export const ACCEPTED_IMAGE_TYPES = [...new Set(IMAGE_MIME_TYPES.values())];

function extensionOf(file: Express.Multer.File): string {
  return path.extname(file.originalname).toLowerCase();
}

function isAcceptedImage(file: Express.Multer.File): boolean {
  return IMAGE_MIME_TYPES.get(extensionOf(file)) === file.mimetype;
}

/**
 * Multer middleware for a cocktail photo. A refused file leaves `req.file` empty.
 * The file stays in memory (MAX_IMAGE_BYTES at most): only its resized copies
 * reach the disk, never the upload itself with its EXIF metadata.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => cb(null, isAcceptedImage(file)),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

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

/** Deletes a stored photo and its smaller copies, if they are still there. Never throws. */
export async function removeImageFile(imagePath: string): Promise<void> {
  const filePath = safeUploadPath(imagePath);
  if (!filePath) return;
  const variantPaths = derivedVariantNames(imagePath).map((name) =>
    path.join(config.uploadDir, name),
  );
  await Promise.all([filePath, ...variantPaths].map(deleteFileQuietly));
}

/**
 * Stores the uploaded photo and its copies, then deletes the previous photo.
 * If the cocktail does not exist or the update fails, the stored files are deleted.
 */
export async function setImage(id: number, file: Express.Multer.File): Promise<Cocktail> {
  const imagePath = await storeUploadedImage(file.buffer);
  let result: { cocktail: Cocktail; previousImagePath: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      const existing = await tx.cocktail.findUnique({ where: { id }, select: { imagePath: true } });
      if (!existing) throw new NotFoundError();
      const cocktail = await tx.cocktail.update({ where: { id }, data: { imagePath } });
      return { cocktail, previousImagePath: existing.imagePath };
    });
  } catch (error) {
    await removeImageFile(imagePath);
    throw error;
  }
  if (result.previousImagePath) await removeImageFile(result.previousImagePath);
  return result.cocktail;
}
