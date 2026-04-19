import { describe, expect, it } from 'vitest';
import { getUploadUrl } from './uploads';

describe('getUploadUrl', () => {
  it('returns null when the image path is missing', () => {
    expect(getUploadUrl(null)).toBeNull();
    expect(getUploadUrl(undefined)).toBeNull();
  });

  it('builds a root-relative uploads url by default', () => {
    expect(getUploadUrl('cocktails/mojito.jpg', '/')).toBe('/uploads/cocktails/mojito.jpg');
  });

  it('keeps an application base path when the app is served behind a reverse proxy prefix', () => {
    expect(getUploadUrl('/cocktails/mojito.jpg', '/carta/')).toBe('/carta/uploads/cocktails/mojito.jpg');
  });
});
