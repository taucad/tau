import { describe, expect, it } from 'vitest';
import { isDesktopLoopbackRedirect } from '#config/desktop-oauth.js';

describe('isDesktopLoopbackRedirect', () => {
  it.each([
    ['http://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', true],
    ['http://127.0.0.1:65535/cb/abcdefghijklmnopqrstuvwxyz_-0123456789', true],
    ['http://127.0.0.1/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['http://127.0.0.1:49152/cb', false],
    ['http://127.0.0.1:49152/cb/short', false],
    ['http://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA/extra', false],
    ['http://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA?next=/', false],
    ['http://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA#x', false],
    ['http://user:pass@127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['http://localhost:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['http://[::1]:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['https://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['http://127.0.0.2:49152/cb/AAAAAAAAAAAAAAAAAAAAAA', false],
    ['tau://auth/callback', false],
    ['not a url', false],
  ])('should judge %s as %s', (uri, expected) => {
    expect(isDesktopLoopbackRedirect(uri)).toBe(expected);
  });
});
