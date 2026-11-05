import { describe, expect, it } from 'vitest';
import { skewProtectionCookie, skewProtectionCookieName } from '#lib/skew-protection.server.js';
import { skewProtectionConfig } from '#scripts/write-skew-protection-config.mts';

/* eslint-disable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
describe('skewProtectionCookie', () => {
  it('sets nothing where Netlify provides no token (local, desktop, tau serve)', () => {
    expect(skewProtectionCookie({})).toBeUndefined();
    expect(skewProtectionCookie({ NETLIFY_SKEW_PROTECTION_TOKEN: '' })).toBeUndefined();
  });

  it('pins later requests with the token the build config reads', () => {
    const cookie = skewProtectionCookie({ NETLIFY_SKEW_PROTECTION_TOKEN: 'a b' });
    expect(cookie).toBe(`${skewProtectionCookieName}=a%20b; Path=/; Secure; HttpOnly; SameSite=Lax`);
    expect(skewProtectionConfig.sources).toStrictEqual([{ type: 'cookie', name: skewProtectionCookieName }]);
  });

  it('pins the chunks, the route data and the manifest, not documents', () => {
    const pinned = (path: string): boolean =>
      skewProtectionConfig.patterns.some((pattern) => new RegExp(pattern, 'u').test(path));
    expect(pinned('/assets/route-CIX3STd0.js')).toBe(true);
    expect(pinned('/projects.data')).toBe(true);
    expect(pinned('/__manifest')).toBe(true);
    expect(pinned('/projects')).toBe(false);
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
