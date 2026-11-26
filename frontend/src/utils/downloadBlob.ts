/**
 * Saves a blob as a file through a temporary link. The object URL is revoked on the next tick:
 * some browsers start the download after `click()` returns and would find the URL already gone.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
