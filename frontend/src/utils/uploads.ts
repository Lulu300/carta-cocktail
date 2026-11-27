export function getUploadUrl(
  imagePath: string | null | undefined,
  baseUrl = import.meta.env.BASE_URL || '/',
): string | null {
  if (!imagePath) return null;

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = imagePath.replace(/^\/+/, '');

  return `${normalizedBase}/uploads/${normalizedPath}`.replace(/\/{2,}/g, '/');
}

// The backend stores every photo at 1600 px wide at most, with WebP copies named
// `<photo without extension>-<width>.webp`. Keep both in line with
// backend/src/services/cocktail/imageVariants.ts.
const PHOTO_WIDTH = 1600;
const COPY_WIDTHS = [480, 960];

/**
 * `srcset` of a stored photo: the browser picks the smallest file that fills the
 * displayed size. A photo stored before the copies existed may still lack them:
 * the <img> then drops this `srcset` and shows the photo itself (UploadedPhoto).
 */
export function getUploadSrcSet(
  imagePath: string | null | undefined,
  baseUrl = import.meta.env.BASE_URL || '/',
): string | null {
  const photoUrl = getUploadUrl(imagePath, baseUrl);
  if (!imagePath || !photoUrl) return null;

  const stem = imagePath.replace(/\.[^./]*$/, '');
  const copies = COPY_WIDTHS.map(
    (width) => `${getUploadUrl(`${stem}-${width}.webp`, baseUrl)} ${width}w`,
  );
  return [...copies, `${photoUrl} ${PHOTO_WIDTH}w`].join(', ');
}
