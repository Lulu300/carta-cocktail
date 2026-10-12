import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { removeImageFile, safeUploadPath } from './cocktailImage';

afterEach(() => { vi.restoreAllMocks(); });

describe('safeUploadPath', () => {
  it('should keep a plain file name in the upload folder', () => {
    expect(safeUploadPath('photo.png')).toBe(path.join(config.uploadDir, 'photo.png'));
  });

  it.each(['../../etc/passwd', '/etc/passwd', '../photo.png', 'sub/photo.png', 'photo.png/'])(
    'should refuse %s, which is not a bare file name',
    (imagePath) => {
      expect(safeUploadPath(imagePath)).toBeNull();
    },
  );

  it.each(['', '.', '..', '/'])('should refuse %j, which names a folder, not a file', (imagePath) => {
    expect(safeUploadPath(imagePath)).toBeNull();
  });
});

describe('removeImageFile', () => {
  it('should delete the file from the upload folder', async () => {
    const file = path.join(config.uploadDir, 'to-remove.png');
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(file, 'png');

    await removeImageFile('to-remove.png');

    expect(fs.existsSync(file)).toBe(false);
  });

  it('should ignore a file that is already gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(removeImageFile('never-existed.png')).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['..', '.', '/', '../to-keep.png'])('should do nothing for %j', async (imagePath) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unlink = vi.spyOn(fs.promises, 'unlink');

    await removeImageFile(imagePath);

    expect(unlink).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('should log, not throw, when the file cannot be deleted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A folder cannot be unlinked
    fs.mkdirSync(path.join(config.uploadDir, 'a-folder'), { recursive: true });

    await expect(removeImageFile('a-folder')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    expect(fs.existsSync(path.join(config.uploadDir, 'a-folder'))).toBe(true);
  });
});
