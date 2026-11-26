import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSignInAfterLogoutEverywhere,
  isSignInAfterRestore,
  openSignInAfterLogoutEverywhere,
  openSignInAfterRestore,
} from './signInAfterRestore';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Replaces the page's location, whose navigation jsdom does not implement. */
function stubLocationAssign() {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  return assign;
}

describe('openSignInAfterRestore', () => {
  it('loads the sign-in page in full, with the reason the page recognises', () => {
    const assign = stubLocationAssign();

    openSignInAfterRestore();

    expect(assign).toHaveBeenCalledOnce();
    const [url] = assign.mock.calls[0]!;
    expect(new URL(url, 'http://localhost').pathname).toBe('/login');
    expect(isSignInAfterRestore(new URL(url, 'http://localhost').search)).toBe(true);
  });
});

describe('openSignInAfterLogoutEverywhere', () => {
  it('loads the sign-in page in full, with its own reason', () => {
    const assign = stubLocationAssign();

    openSignInAfterLogoutEverywhere();

    const [url] = assign.mock.calls[0]!;
    const { pathname, search } = new URL(url, 'http://localhost');
    expect(pathname).toBe('/login');
    expect(isSignInAfterLogoutEverywhere(search)).toBe(true);
    expect(isSignInAfterRestore(search)).toBe(false);
  });
});

describe('isSignInAfterRestore', () => {
  it.each([
    ['no query string', ''],
    ['another reason', '?reason=expired'],
    ['an unrelated parameter', '?backup-restored'],
  ])('is false with %s', (_label, search) => {
    expect(isSignInAfterRestore(search)).toBe(false);
  });

  it('is true with the restore reason among other parameters', () => {
    expect(isSignInAfterRestore('?lang=fr&reason=backup-restored')).toBe(true);
  });
});
