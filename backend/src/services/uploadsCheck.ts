import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Startup check of the folder that holds the cocktail photos.
 *
 * Since v1.5.0 the image reads and writes photos in /app/uploads, while v1.4.0
 * used /uploads. An instance that still mounts its photos on /uploads starts
 * without error, serves no photo, and loses every new upload at the next
 * container recreation. This check finds both symptoms so the admin is warned.
 */

/** Only the cocktail table is read: any client or transaction client fits. */
export type UploadsCheckDb = Pick<PrismaClient, 'cocktail'>;

export interface UploadsCheckOptions {
  uploadDir: string;
  /** Mount table of the current process (Linux only). */
  mountInfoPath?: string;
  /** Files that only exist inside a container: Docker, then Podman. */
  containerMarkers?: string[];
}

export interface UploadsCheckResult {
  uploadDir: string;
  inContainer: boolean;
  /**
   * True when the folder, or one of its parents other than `/`, is a mount
   * (volume or bind mount), so its files survive a container recreation.
   * Null when the mount table cannot be read (not Linux).
   */
  onMount: boolean | null;
  /** Cocktails that reference a photo. */
  referencedPhotos: number;
  /** Referenced photos whose file is not in the folder. */
  missingPhotos: number;
}

const DEFAULT_MOUNT_INFO_PATH = '/proc/self/mountinfo';
const DEFAULT_CONTAINER_MARKERS = ['/.dockerenv', '/run/.containerenv'];
const UPGRADING_GUIDE = 'https://github.com/Lulu300/carta-cocktail/blob/main/UPGRADING.md#v150';

/** The kernel escapes spaces, tabs, newlines and backslashes as octal (`\040`). */
function unescapeMountPath(field: string): string {
  return field.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

/** Mount points listed in a /proc/<pid>/mountinfo file (5th field of each line). */
export function parseMountPoints(mountInfo: string): string[] {
  return mountInfo
    .split('\n')
    .map((line) => line.split(' ')[4])
    .filter((field): field is string => Boolean(field))
    .map(unescapeMountPath);
}

function isInside(folder: string, parent: string): boolean {
  const relative = path.relative(parent, folder);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  return !outside;
}

/** Whether a mount other than the root file system holds the folder. */
export function isOnMount(folder: string, mountPoints: string[]): boolean {
  return mountPoints.some((mountPoint) => mountPoint !== '/' && isInside(folder, mountPoint));
}

/** Follows symbolic links, so the path matches the one in the mount table. */
function realPathOrSelf(folder: string): string {
  try {
    return fs.realpathSync(folder);
  } catch {
    return folder;
  }
}

function readMountPoints(mountInfoPath: string): string[] | null {
  try {
    return parseMountPoints(fs.readFileSync(mountInfoPath, 'utf8'));
  } catch {
    return null;
  }
}

async function countPhotos(db: UploadsCheckDb, uploadDir: string): Promise<{ referenced: number; missing: number }> {
  const cocktails = await db.cocktail.findMany({
    where: { imagePath: { not: null } },
    select: { imagePath: true },
  });
  const imagePaths = cocktails.map((cocktail) => cocktail.imagePath).filter((imagePath): imagePath is string => Boolean(imagePath));
  const missing = imagePaths.filter((imagePath) => !fs.existsSync(path.join(uploadDir, imagePath))).length;
  return { referenced: imagePaths.length, missing };
}

/**
 * Checks where the photos are stored and whether the referenced ones exist.
 * Read-only, and returns counts only: callers never get file or cocktail names.
 */
export async function checkUploads(db: UploadsCheckDb, options: UploadsCheckOptions): Promise<UploadsCheckResult> {
  const {
    uploadDir,
    mountInfoPath = DEFAULT_MOUNT_INFO_PATH,
    containerMarkers = DEFAULT_CONTAINER_MARKERS,
  } = options;
  const inContainer = containerMarkers.some((marker) => fs.existsSync(marker));
  const mountPoints = readMountPoints(mountInfoPath);
  const onMount = mountPoints === null ? null : isOnMount(realPathOrSelf(uploadDir), mountPoints);
  const photos = await countPhotos(db, uploadDir);
  return {
    uploadDir,
    inContainer,
    onMount,
    referencedPhotos: photos.referenced,
    missingPhotos: photos.missing,
  };
}

/**
 * Warnings for the server log, in English. Empty when everything is fine.
 * Outside a container (local development) the folder is not expected to be a mount.
 */
export function formatUploadsWarnings(result: UploadsCheckResult): string[] {
  const warnings: string[] = [];
  if (result.inContainer && result.onMount === false) {
    warnings.push(
      `[uploads] WARNING: the upload folder ${result.uploadDir} is not a mounted volume or host folder. `
      + 'Photos stored there are lost when the container is recreated (at the next update at the latest). '
      + `Mount your photo volume or folder on ${result.uploadDir}: see ${UPGRADING_GUIDE} ("Photos mounted on /uploads").`,
    );
  }
  if (result.missingPhotos > 0) {
    warnings.push(
      `[uploads] WARNING: ${result.missingPhotos} of ${result.referencedPhotos} cocktail photos are missing from ${result.uploadDir}. `
      + `If they are in another folder or volume, mount it on ${result.uploadDir}: see ${UPGRADING_GUIDE}.`,
    );
  }
  return warnings;
}

/**
 * Runs the check at startup and logs its warnings. Never throws: a failing
 * check must not keep the server from starting.
 */
export async function reportUploadsCheck(
  db: UploadsCheckDb,
  options: UploadsCheckOptions,
  logger: Pick<Console, 'warn'> = console,
): Promise<UploadsCheckResult | null> {
  try {
    const result = await checkUploads(db, options);
    formatUploadsWarnings(result).forEach((warning) => logger.warn(warning));
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`[uploads] Startup check of ${options.uploadDir} skipped: ${reason}`);
    return null;
  }
}
