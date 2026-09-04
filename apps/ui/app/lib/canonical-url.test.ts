import { describe, expect, it } from 'vitest';
import { metaConfig } from '#constants/meta.constants.js';
import { canonicalProductionUrl, isCanonicalProductionUrl } from '#lib/canonical-url.js';

describe('canonicalProductionUrl', () => {
  it('exposes a `URL` instance whose hostname matches `metaConfig.appDomain`', () => {
    expect(canonicalProductionUrl).toBeInstanceOf(URL);
    expect(canonicalProductionUrl.hostname).toBe(metaConfig.appDomain.toLowerCase());
    expect(canonicalProductionUrl.protocol).toBe('https:');
  });

  it('resolves child URLs against the canonical origin', () => {
    expect(new URL('/sitemap.xml', canonicalProductionUrl).origin).toBe(canonicalProductionUrl.origin);
    expect(new URL('/legal/terms', canonicalProductionUrl).pathname).toBe('/legal/terms');
  });
});

describe('isCanonicalProductionUrl', () => {
  it('returns true for the canonical origin', () => {
    expect(isCanonicalProductionUrl(canonicalProductionUrl.origin)).toBe(true);
  });

  it('ignores trailing slash, path, and query', () => {
    expect(isCanonicalProductionUrl(`${canonicalProductionUrl.origin}/`)).toBe(true);
    expect(isCanonicalProductionUrl(`${canonicalProductionUrl.origin}/some/path`)).toBe(true);
    expect(isCanonicalProductionUrl(`${canonicalProductionUrl.origin}/?ref=docs`)).toBe(true);
  });

  it('returns false for staging, previews, and localhost', () => {
    expect(isCanonicalProductionUrl('https://staging.taucad.dev')).toBe(false);
    expect(isCanonicalProductionUrl('https://deploy-preview-42--taucad.netlify.app')).toBe(false);
    expect(isCanonicalProductionUrl('http://localhost:3000')).toBe(false);
  });

  it('throws on malformed input so misconfiguration fails fast', () => {
    expect(() => isCanonicalProductionUrl('not-a-url')).toThrow(TypeError);
  });
});
