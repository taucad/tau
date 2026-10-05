import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Netlify edge functions sit outside the app alias root.
import { config, resolveMarketingUrl, rewriteLocation } from './marketing.js';

const origin = 'https://marketing.example.netlify.app';

function resolve(path: string, method = 'GET', ...marketingOrigin: [string?]): string | undefined {
  const resolvedOrigin = marketingOrigin.length > 0 ? marketingOrigin[0] : origin;
  return resolveMarketingUrl(new URL(path, 'https://tau.new'), method, resolvedOrigin)?.toString();
}

describe('resolveMarketingUrl', () => {
  it('should pass every request through when no marketing origin is set', () => {
    expect(resolve('/', 'GET', undefined)).toBeUndefined();
    expect(resolve('/pricing/', 'GET', '')).toBeUndefined();
  });

  it('should serve the homepage and marketing pages from the marketing origin', () => {
    expect(resolve('/')).toBe(`${origin}/`);
    expect(resolve('/pricing')).toBe(`${origin}/pricing`);
    expect(resolve('/use-cases/engineering/')).toBe(`${origin}/use-cases/engineering/`);
    expect(resolve('/_www/assets/site.css')).toBe(`${origin}/_www/assets/site.css`);
  });

  it('should keep app routes, including look-alike prefixes, on the app', () => {
    for (const path of ['/projects', '/vision', '/legal/privacy', '/settings/billing', '/pricingx', '/assets/a.js']) {
      expect(resolve(path)).toBeUndefined();
    }
  });

  it('should keep the app homepage for app query parameters and allow campaign parameters', () => {
    expect(resolve('/?settings=billing')).toBeUndefined();
    expect(resolve('/?code=abc')).toBeUndefined();
    expect(resolve('/?utm_source=x&ref=hn')).toBe(`${origin}/`);
  });

  it('should drop the query when proxying a marketing page', () => {
    expect(resolve('/pricing/?utm_source=x')).toBe(`${origin}/pricing/`);
  });

  it('should leave non-read methods to the app', () => {
    expect(resolve('/', 'POST')).toBeUndefined();
    expect(resolve('/', 'HEAD')).toBe(`${origin}/`);
  });
});

describe('rewriteLocation', () => {
  const upstream = new URL(`${origin}/pricing`);
  const requestUrl = new URL('https://tau.new/pricing');

  it('should keep marketing redirects on the requesting hostname', () => {
    expect(rewriteLocation(`${origin}/pricing/`, upstream, requestUrl)).toBe('https://tau.new/pricing/');
    expect(rewriteLocation('/pricing/', upstream, requestUrl)).toBe('https://tau.new/pricing/');
  });

  it('should leave redirects to other hosts unchanged', () => {
    expect(rewriteLocation('https://docs.tau.new/', upstream, requestUrl)).toBe('https://docs.tau.new/');
  });
});

describe('config', () => {
  it('should register the homepage and each marketing prefix with its subpaths', () => {
    expect(config.path).toContain('/');
    expect(config.path).toContain('/blog');
    expect(config.path).toContain('/blog/*');
    expect(config.path).not.toContain('/vision');
  });
});
