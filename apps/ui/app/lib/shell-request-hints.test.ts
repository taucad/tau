import { describe, expect, it } from 'vitest';
import { readShellRequestHints, sidebarOpenCookieName } from '#lib/shell-request-hints.js';
import { sidebarDefaultOpen } from '#constants/sidebar.constants.js';

const requestWith = (headers: Record<string, string>): Request =>
  new Request('https://tau.new/', { headers: new Headers(headers) });

describe('readShellRequestHints', () => {
  it('reads the mirrored sidebar state and the request platform', () => {
    expect(
      readShellRequestHints(
        requestWith({
          Cookie: `other=1; ${sidebarOpenCookieName}=0`,
          'Sec-CH-UA-Platform': '"Windows"',
        }),
      ),
    ).toEqual({ isSidebarOpen: false, platform: 'other' });
    expect(
      readShellRequestHints(
        requestWith({
          Cookie: `${sidebarOpenCookieName}=1`,
          'Sec-CH-UA-Platform': '"macOS"',
        }),
      ),
    ).toEqual({ isSidebarOpen: true, platform: 'mac' });
  });

  it('uses the sidebar default for a request without a valid mirror', () => {
    expect(readShellRequestHints(requestWith({})).isSidebarOpen).toBe(sidebarDefaultOpen);
    expect(readShellRequestHints(requestWith({ Cookie: `${sidebarOpenCookieName}=maybe` })).isSidebarOpen).toBe(
      sidebarDefaultOpen,
    );
  });
});
