import { describe, it, expect } from 'vitest';
import path from 'path';
import { assertJwtSecret, resolveUploadDir } from './config';

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

describe('assertJwtSecret', () => {
  const strongSecret = '0123456789abcdef'.repeat(4);
  const rejectedSecrets: Array<[string, string | undefined]> = [
    ['undefined', undefined],
    ['an empty string', ''],
    ['a 31-character string', 'x'.repeat(31)],
    ['the old compose default', 'change-me-to-a-random-secret'],
    ['the old config default', 'default-secret'],
  ];

  describe.each(['production', undefined])('with NODE_ENV=%s', (nodeEnv) => {
    it.each(rejectedSecrets)('should reject %s', (_label, secret) => {
      expect(() => assertJwtSecret(secret, nodeEnv)).toThrow(
        'JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)',
      );
    });

    it('should accept a 64-character hex secret', () => {
      expect(assertJwtSecret(strongSecret, nodeEnv)).toBe(strongSecret);
    });
  });

  it.each(rejectedSecrets)('should not reject %s when NODE_ENV is test', (_label, secret) => {
    expect(() => assertJwtSecret(secret, 'test')).not.toThrow();
  });
});
