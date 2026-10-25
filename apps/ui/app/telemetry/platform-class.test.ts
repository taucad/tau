import { describe, expect, it } from 'vitest';
import { osClass, platformClass } from '#telemetry/platform-class.js';

const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const safari =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('platformClass', () => {
  it('should always answer electron in the desktop renderer', () => {
    expect(platformClass({ userAgent: firefox }, true)).toBe('electron');
  });

  it('should prefer client hints', () => {
    expect(platformClass({ userAgent: safari, userAgentData: { brands: [{ brand: 'Chromium' }] } })).toBe('chromium');
  });

  it.each([
    [chrome, 'chromium'],
    [firefox, 'firefox'],
    [safari, 'webkit'],
    ['', 'chromium'],
  ])('should classify %s', (userAgent, expected) => {
    expect(platformClass({ userAgent })).toBe(expected);
  });
});

describe('osClass', () => {
  it.each([
    [{ userAgentData: { platform: 'Windows' } }, 'windows'],
    [{ userAgentData: { platform: 'macOS' } }, 'macos'],
    [{ userAgentData: { platform: 'Chrome OS' } }, 'linux'],
    [{ userAgent: iphone, platform: 'iPhone' }, 'ios'],
    [{ userAgent: safari, platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
    [{ userAgent: safari, platform: 'MacIntel', maxTouchPoints: 0 }, 'macos'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l' }, 'android'],
    [{ userAgent: firefox, platform: 'Win32' }, 'windows'],
    [{ userAgent: chrome, platform: 'Linux x86_64' }, 'linux'],
    [{}, 'other'],
  ] as const)('should classify %o', (facts, expected) => {
    expect(osClass(facts)).toBe(expected);
  });
});
