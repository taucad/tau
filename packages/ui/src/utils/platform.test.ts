import { describe, expect, it } from 'vitest';
import { detectRequestPlatform, serverPlatform } from '#utils/platform.js';

describe('detectRequestPlatform', () => {
  it('reads the platform client hint first', () => {
    const headers = new Headers({
      'Sec-CH-UA-Platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    expect(detectRequestPlatform(headers)).toBe('other');
    expect(detectRequestPlatform(new Headers({ 'Sec-CH-UA-Platform': '"macOS"' }))).toBe('mac');
  });

  it('falls back to the user agent where the browser sends no client hint', () => {
    expect(
      detectRequestPlatform(
        new Headers({
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
        }),
      ),
    ).toBe('other');
    expect(
      detectRequestPlatform(
        new Headers({
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
        }),
      ),
    ).toBe('mac');
  });

  it('assumes the server platform for a request that names none', () => {
    expect(detectRequestPlatform(new Headers())).toBe(serverPlatform);
  });
});
