import { vi } from 'vitest';

/**
 * The app saves a file through a temporary link to an object URL, which jsdom
 * cannot follow. This stubs the object URLs and records the link clicks instead.
 * Returns the names of the files downloaded so far. Undo with `vi.restoreAllMocks()`.
 */
export function mockDownload(): string[] {
  const fileNames: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload(this: HTMLAnchorElement) {
    fileNames.push(this.download);
  });
  return fileNames;
}
