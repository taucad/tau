import { describe, expect, it } from 'vitest';

import { desktopReleaseIdentity, stagingPackageVersion } from '#shared/desktop-release.js';

describe('desktop release identity', () => {
  it('should preserve numeric order across bundle version rollovers', () => {
    expect([15, 99, 100, 9999, 10_000].map((sequence) => stagingPackageVersion(sequence))).toEqual([
      '1.0.15',
      '1.0.99',
      '1.1.0',
      '1.99.99',
      '2.0.0',
    ]);
    for (const sequence of [0, -1, 1.5, Number.NaN, 99_990_000]) {
      expect(() => stagingPackageVersion(sequence)).toThrow(TypeError);
    }
  });

  it('should distinguish source version from staging distribution version', () => {
    expect(desktopReleaseIdentity('desktop-staging@0.0.1-staging.15')).toEqual({
      channel: 'staging',
      version: '1.0.15',
    });
    expect(desktopReleaseIdentity('desktop@0.1.0')).toEqual({ channel: 'production', version: '0.1.0' });
    for (const tag of ['desktop@1.100.0', 'desktop@1.2.3/other', 'desktop-staging@0.1.0-staging.0']) {
      expect(() => desktopReleaseIdentity(tag)).toThrow(TypeError);
    }
  });
});
