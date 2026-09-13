import { describe, expect, it } from 'vitest';
import { canonicalProductionUrl } from '#lib/canonical-url.js';
import { buildRobotsTxt } from '#routes/robots[.]txt/route.js';

const productionOrigin = canonicalProductionUrl.origin;
const sitemapHref = new URL('/sitemap.xml', canonicalProductionUrl).href;

describe('buildRobotsTxt', () => {
  it('emits the production policy when the frontend URL matches the canonical origin', () => {
    const body = buildRobotsTxt(productionOrigin);

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain(`Sitemap: ${sitemapHref}`);
    for (const directive of [
      'Disallow: /api/',
      'Disallow: /auth/',
      'Disallow: /projects',
      'Disallow: /projects/',
      'Disallow: /projects_',
      'Disallow: /files',
      'Disallow: /settings_',
      'Disallow: /usage',
      'Disallow: /workflows',
      'Disallow: /convert',
      'Disallow: /import/',
      'Disallow: /i/',
      'Disallow: /*?utm_',
    ]) {
      expect(body).toContain(directive);
    }
  });

  it('normalises the frontend URL via `new URL` (trailing slash, path, query are ignored)', () => {
    const baseline = buildRobotsTxt(productionOrigin);
    expect(buildRobotsTxt(`${productionOrigin}/`)).toBe(baseline);
    expect(buildRobotsTxt(`${productionOrigin}/some/path`)).toBe(baseline);
    expect(buildRobotsTxt(`${productionOrigin}/?ref=docs`)).toBe(baseline);
  });

  it('blocks all crawlers on staging / preview origins', () => {
    expect(buildRobotsTxt('https://staging.taucad.dev')).toBe('User-agent: *\nDisallow: /\n');
  });

  it('blocks all crawlers on Netlify deploy previews', () => {
    expect(buildRobotsTxt('https://deploy-preview-42--taucad.netlify.app')).toBe('User-agent: *\nDisallow: /\n');
  });

  it('blocks all crawlers on localhost dev', () => {
    expect(buildRobotsTxt('http://localhost:3000')).toBe('User-agent: *\nDisallow: /\n');
  });

  it('throws on a malformed frontend URL so misconfiguration fails fast', () => {
    expect(() => buildRobotsTxt('not-a-url')).toThrow(TypeError);
  });

  it('is deterministic for a given origin', () => {
    expect(buildRobotsTxt(productionOrigin)).toBe(buildRobotsTxt(productionOrigin));
    expect(buildRobotsTxt('http://localhost:3000')).toBe(buildRobotsTxt('http://localhost:3000'));
  });
});
