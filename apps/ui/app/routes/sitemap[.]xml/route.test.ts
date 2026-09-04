import { describe, expect, it } from 'vitest';
import { canonicalProductionUrl } from '#lib/canonical-url.js';
import { buildSitemapXml } from '#routes/sitemap[.]xml/route.js';

const productionOrigin = canonicalProductionUrl.origin;
const fixedLastmod = '2026-05-07';

const samplePaths = ['/', '/legal/terms', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest'];

describe('buildSitemapXml', () => {
  it('emits an empty <urlset> for non-canonical origins (staging, preview, localhost)', () => {
    for (const origin of [
      'https://staging.taucad.dev',
      'https://deploy-preview-42--taucad.netlify.app',
      'http://localhost:3000',
    ]) {
      const xml = buildSitemapXml({ frontendUrl: origin, paths: samplePaths, lastmod: fixedLastmod });
      expect(xml).toContain('<urlset');
      expect(xml).not.toContain('<url>');
      expect(xml).not.toContain('<loc>');
    }
  });

  it('emits a populated <urlset> for the canonical production origin', () => {
    const xml = buildSitemapXml({ frontendUrl: productionOrigin, paths: samplePaths, lastmod: fixedLastmod });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${productionOrigin}/</loc>`);
    expect(xml).toContain(`<loc>${productionOrigin}/legal/terms</loc>`);
  });

  it('excludes /robots.txt, /sitemap.xml, and /manifest.webmanifest from the urlset', () => {
    const xml = buildSitemapXml({ frontendUrl: productionOrigin, paths: samplePaths, lastmod: fixedLastmod });

    expect(xml).not.toContain('/robots.txt');
    expect(xml).not.toContain('/sitemap.xml');
    expect(xml).not.toContain('/manifest.webmanifest');
  });

  it('classifies the home page as weekly + 1.0', () => {
    const xml = buildSitemapXml({ frontendUrl: productionOrigin, paths: ['/'], lastmod: fixedLastmod });

    expect(xml).toMatch(
      /<loc>https:\/\/[^<]+\/<\/loc>\s*<lastmod>2026-05-07<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>1\.0<\/priority>/,
    );
  });

  it('classifies non-home paths as monthly + 0.5', () => {
    const xml = buildSitemapXml({ frontendUrl: productionOrigin, paths: ['/legal/terms'], lastmod: fixedLastmod });

    expect(xml).toContain('<changefreq>monthly</changefreq>');
    expect(xml).toContain('<priority>0.5</priority>');
  });

  it('builds absolute <loc> URLs against the canonical origin', () => {
    const xml = buildSitemapXml({ frontendUrl: productionOrigin, paths: ['/legal/privacy'], lastmod: fixedLastmod });
    const match = /<loc>([^<]+)<\/loc>/.exec(xml);

    expect(match).not.toBeNull();
    const loc = match![1]!;
    const parsed = new URL(loc);
    expect(parsed.origin).toBe(canonicalProductionUrl.origin);
    expect(parsed.pathname).toBe('/legal/privacy');
  });

  it('XML-escapes special characters in path segments', () => {
    const xml = buildSitemapXml({
      frontendUrl: productionOrigin,
      paths: ['/legal/foo&bar'],
      lastmod: fixedLastmod,
    });

    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/<loc>[^<]*foo&bar/);
  });

  it('is deterministic given identical inputs', () => {
    const a = buildSitemapXml({ frontendUrl: productionOrigin, paths: samplePaths, lastmod: fixedLastmod });
    const b = buildSitemapXml({ frontendUrl: productionOrigin, paths: samplePaths, lastmod: fixedLastmod });
    expect(a).toBe(b);
  });

  it('throws on a malformed frontend URL so misconfiguration fails fast', () => {
    expect(() => buildSitemapXml({ frontendUrl: 'not-a-url', paths: samplePaths, lastmod: fixedLastmod })).toThrow(
      TypeError,
    );
  });
});
