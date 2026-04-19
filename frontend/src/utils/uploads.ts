export function getUploadUrl(imagePath: string | null | undefined, baseUrl = import.meta.env.BASE_URL || '/'): string | null {
  if (!imagePath) return null;

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = imagePath.replace(/^\/+/, '');

  return `${normalizedBase}/uploads/${normalizedPath}`.replace(/\/{2,}/g, '/');
}
