import { describe, expect, it } from 'vitest';
import { getUploadSrcSet, getUploadUrl } from './uploads';

describe('getUploadUrl', () => {
  it('returns null when the image path is missing', () => {
    expect(getUploadUrl(null)).toBeNull();
    expect(getUploadUrl(undefined)).toBeNull();
  });

  it('builds a root-relative uploads url by default', () => {
    expect(getUploadUrl('cocktails/mojito.jpg', '/')).toBe('/uploads/cocktails/mojito.jpg');
  });

  it('keeps an application base path when the app is served behind a reverse proxy prefix', () => {
    expect(getUploadUrl('/cocktails/mojito.jpg', '/carta/')).toBe(
      '/carta/uploads/cocktails/mojito.jpg',
    );
  });
});

describe('getUploadSrcSet', () => {
  it('returns null when the image path is missing', () => {
    expect(getUploadSrcSet(null)).toBeNull();
    expect(getUploadSrcSet('')).toBeNull();
  });

  it('lists the WebP copies, then the photo itself, by width', () => {
    expect(getUploadSrcSet('3f2c.webp', '/')).toBe(
      '/uploads/3f2c-480.webp 480w, /uploads/3f2c-960.webp 960w, /uploads/3f2c.webp 1600w',
    );
  });

  it('names the copies of a photo stored before them after the photo, without its extension', () => {
    expect(getUploadSrcSet('1700000000-42.JPG', '/carta/')).toBe(
      '/carta/uploads/1700000000-42-480.webp 480w, /carta/uploads/1700000000-42-960.webp 960w, ' +
        '/carta/uploads/1700000000-42.JPG 1600w',
    );
  });
});
