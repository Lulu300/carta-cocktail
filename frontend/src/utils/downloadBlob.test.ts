import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob';

describe('downloadBlob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks a link to the blob with the file name, then removes it', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: { href: string; download: string; inDocument: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        href: this.href,
        download: this.download,
        inDocument: document.body.contains(this),
      });
    });

    downloadBlob(new Blob(['x']), 'recipe.json');

    expect(clicked).toEqual([{ href: 'blob:file', download: 'recipe.json', inDocument: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revokes the object URL only after the click has been handled', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'recipe.json');
    expect(revoke).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:file');
  });
});
