import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { PrismaClient } from '../../generated/prisma/client';
import { config } from '../../config';
import { BadRequestError } from '../../errors';
import { describeError } from '../uploadsCheck';

/**
 * Smaller copies of a cocktail photo, named after the photo itself: the
 * database stores one name (`Cocktail.imagePath`) and every copy follows from
 * it, so no schema change and no lookup. `frontend/src/utils/uploads.ts`
 * builds the same names: keep both in line.
 */
interface ImageVariant {
  /** Added to the photo's name without its extension. */
  suffix: string;
  /** Largest width, never enlarged. */
  width: number;
  format: 'webp' | 'jpeg';
}

// The photo itself, as an upload stores it. Wide enough for a desktop screen.
const MAIN_IMAGE: ImageVariant = { suffix: '', width: 1600, format: 'webp' };

// Link previews (og:image): WhatsApp and iMessage do not always show a WebP image
const PREVIEW_VARIANT: ImageVariant = { suffix: '-og', width: 1200, format: 'jpeg' };

/** Copies made for every photo, at upload and for the photos stored before them. */
const DERIVED_VARIANTS: ImageVariant[] = [
  { suffix: '-960', width: 960, format: 'webp' },
  { suffix: '-480', width: 480, format: 'webp' },
  PREVIEW_VARIANT,
];

// About 80 keeps a phone photo of 1600 px well under 400 kB without visible loss
const QUALITY = 80;
const FILE_EXTENSIONS = { webp: '.webp', jpeg: '.jpg' } as const;

// Names that resolve to the upload folder itself or to its parent
const FOLDER_NAMES = new Set(['', '.', '..']);

/**
 * Path of a stored photo, or null when `imagePath` is not a bare file name.
 * The upload always stored bare names, so anything else (`../../etc/passwd`,
 * `../<another photo>`, `..`) comes from a crafted backup and points to no photo.
 */
export function safeUploadPath(imagePath: string): string | null {
  const isBareFileName = path.basename(imagePath) === imagePath && !FOLDER_NAMES.has(imagePath);
  return isBareFileName ? path.join(config.uploadDir, imagePath) : null;
}

function stemOf(imagePath: string): string {
  return imagePath.slice(0, imagePath.length - path.extname(imagePath).length);
}

function variantName(imagePath: string, variant: ImageVariant): string {
  return `${stemOf(imagePath)}${variant.suffix}${FILE_EXTENSIONS[variant.format]}`;
}

function fileExists(fileName: string): boolean {
  return fs.existsSync(path.join(config.uploadDir, fileName));
}

/** Names of the copies derived from a stored photo, the photo itself left out. */
export function derivedVariantNames(imagePath: string): string[] {
  return DERIVED_VARIANTS.map((variant) => variantName(imagePath, variant));
}

/**
 * File a link preview shows: the JPEG copy, or the photo itself while that copy
 * is missing (a photo the backfill has not reached yet, or could not read).
 */
export function previewImageName(imagePath: string): string {
  const preview = variantName(imagePath, PREVIEW_VARIANT);
  return safeUploadPath(imagePath) && fileExists(preview) ? preview : imagePath;
}

/**
 * Encodes one copy. `rotate()` applies the EXIF orientation, so a portrait photo
 * stays upright; sharp writes no metadata unless asked to, so the EXIF block and
 * its GPS position are gone from every copy.
 */
function renderVariant(input: Buffer, variant: ImageVariant): Promise<Buffer> {
  const resized = sharp(input).rotate().resize({ width: variant.width, withoutEnlargement: true });
  if (variant.format === 'webp') return resized.webp({ quality: QUALITY }).toBuffer();
  // JPEG has no transparency: a transparent PNG gets a white background, not a black one
  return resized.flatten({ background: '#ffffff' }).jpeg({ quality: QUALITY }).toBuffer();
}

/**
 * Writes the file under a hidden temporary name, then renames it: a copy cut
 * short by a crash never passes for a complete one, and express.static does
 * not serve hidden files meanwhile.
 */
async function writeFileAtomically(fileName: string, content: Buffer): Promise<void> {
  const finalPath = path.join(config.uploadDir, fileName);
  const partialPath = path.join(config.uploadDir, `.${fileName}.partial`);
  try {
    await fs.promises.writeFile(partialPath, content);
    await fs.promises.rename(partialPath, finalPath);
  } catch (error) {
    await fs.promises.rm(partialPath, { force: true });
    throw error;
  }
}

/**
 * Stores an uploaded photo under a new random name, with all its copies, and
 * returns that name. Nothing is written when the file is not a readable image
 * (400); a write that fails halfway removes what it wrote.
 */
export async function storeUploadedImage(upload: Buffer): Promise<string> {
  const imagePath = `${crypto.randomUUID()}${FILE_EXTENSIONS[MAIN_IMAGE.format]}`;
  const variants = [MAIN_IMAGE, ...DERIVED_VARIANTS];
  let encoded: Buffer[];
  try {
    encoded = await Promise.all(variants.map((variant) => renderVariant(upload, variant)));
  } catch {
    throw new BadRequestError('errors.invalidImage');
  }

  await fs.promises.mkdir(config.uploadDir, { recursive: true });
  const fileNames = variants.map((variant) => variantName(imagePath, variant));
  try {
    for (const [index, fileName] of fileNames.entries()) {
      await writeFileAtomically(fileName, encoded[index]);
    }
  } catch (error) {
    await Promise.all(
      fileNames.map((name) => fs.promises.rm(path.join(config.uploadDir, name), { force: true })),
    );
    throw error;
  }
  return imagePath;
}

/** Adds the copies a stored photo lacks. Returns how many were written. */
async function addMissingVariants(imagePath: string, photoPath: string): Promise<number> {
  const missing = DERIVED_VARIANTS.filter(
    (variant) => !fileExists(variantName(imagePath, variant)),
  );
  if (missing.length === 0) return 0;
  // The photo is read, never rewritten: it may be the only full-size copy
  const original = await fs.promises.readFile(photoPath);
  for (const variant of missing) {
    await writeFileAtomically(
      variantName(imagePath, variant),
      await renderVariant(original, variant),
    );
  }
  return missing.length;
}

/** Only the cocktail table is read: any client fits. */
export type ImageVariantsDb = Pick<PrismaClient, 'cocktail'>;

export interface BackfillResult {
  created: number;
  failed: number;
}

/**
 * Adds the missing copies of every stored photo: photos uploaded before the
 * copies existed, and those a backup restore brings back. Idempotent: a photo
 * with all its copies is skipped. A photo that cannot be read keeps no copy
 * and is counted in `failed`; the public pages then show the photo itself.
 */
async function backfill(db: ImageVariantsDb): Promise<BackfillResult> {
  const cocktails = await db.cocktail.findMany({
    where: { imagePath: { not: null } },
    select: { imagePath: true },
    distinct: ['imagePath'],
  });
  const result: BackfillResult = { created: 0, failed: 0 };
  for (const { imagePath } of cocktails) {
    const photoPath = imagePath ? safeUploadPath(imagePath) : null;
    // A missing photo is reported by the startup check of the folder (uploadsCheck.ts)
    if (!imagePath || !photoPath || !fs.existsSync(photoPath)) continue;
    try {
      result.created += await addMissingVariants(imagePath, photoPath);
    } catch (error) {
      result.failed++;
      console.warn(`[uploads] No smaller copies of ${imagePath}: ${describeError(error)}`);
    }
  }
  if (result.created > 0) console.log(`[uploads] ${result.created} smaller photo copies added`);
  return result;
}

// Runs one at a time: a restore may ask for a run while the startup one goes on
let lastBackfill: Promise<BackfillResult | null> = Promise.resolve(null);

/**
 * Queues a backfill after the running one and returns it. Never rejects: the
 * pages show the photo itself as long as its copies are missing, so a failure
 * is only logged. Called at startup and after a backup restore.
 */
export function backfillImageVariants(db: ImageVariantsDb): Promise<BackfillResult | null> {
  const run = async () => {
    try {
      return await backfill(db);
    } catch (error) {
      console.warn(`[uploads] Smaller photo copies not checked: ${describeError(error)}`);
      return null;
    }
  };
  lastBackfill = lastBackfill.then(run);
  return lastBackfill;
}
