import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveUploadDir } from './config';

describe('resolveUploadDir', () => {
  it('should use UPLOAD_DIR when it is an absolute path', () => {
    expect(resolveUploadDir({ UPLOAD_DIR: '/tmp/x' })).toBe(path.resolve('/tmp/x'));
  });

  it('should resolve a relative UPLOAD_DIR to an absolute path', () => {
    const dir = resolveUploadDir({ UPLOAD_DIR: 'rel/dir' });
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir).toBe(path.resolve('rel/dir'));
  });

  it('should default to the repository uploads folder when UPLOAD_DIR is not set', () => {
    const dir = resolveUploadDir({});
    expect(dir).toBe(path.resolve(__dirname, '../../uploads'));
    expect(dir).not.toContain(`${path.sep}dist${path.sep}`);
  });

  it('should fall back to the default when UPLOAD_DIR is empty', () => {
    expect(resolveUploadDir({ UPLOAD_DIR: '' })).toBe(resolveUploadDir({}));
  });
});
