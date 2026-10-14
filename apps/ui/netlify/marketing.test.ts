import { afterEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root.
import marketing, { config, resolveMarketingUrl, rewriteLocation } from './edge-functions/marketing.js';

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

describe('marketing response selection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['GET', 'HEAD'])(
    'should serve app preference on bare and campaign URLs for %s without a marketing fetch',
    async (method) => {
      vi.stubGlobal('Netlify', { env: { get: () => origin } });
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await Promise.all(
        ['/', '/?utm_source=return'].map(async (path) => {
          const next = vi.fn(
            async () =>
              new Response('app', { headers: { 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=600' } }),
          );
          const response = await marketing(
            new Request(`https://tau.new${path}`, { method, headers: { cookie: 'other=x; tau-entry=app' } }),
            { next },
          );
          expect(await response.text()).toBe('app');
          expect(response.headers.get('cache-control')).toBe('private, no-store');
          expect(response.headers.get('netlify-cdn-cache-control')).toBe('no-store');
          expect(next).toHaveBeenCalledOnce();
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'tau-entry=website', 'not-tau-entry=app', 'tau-entry=apple', 'tau-entry=app; tau-entry=website'])(
    'should keep marketing for cookie %s without forwarding credentials',
    async (cookie) => {
      vi.stubGlobal('Netlify', { env: { get: () => origin } });
      const fetch = vi.fn(
        async () =>
          new Response('marketing', { headers: { 'cache-control': 'public', 'CDN-Cache-Control': 'public' } }),
      );
      vi.stubGlobal('fetch', fetch);
      const response = await marketing(
        new Request('https://tau.new/', { headers: { cookie, authorization: 'Bearer test' } }),
        { next: vi.fn() },
      );
      expect(await response.text()).toBe('marketing');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(fetch).toHaveBeenCalledWith(new URL(`${origin}/`), {
        method: 'GET',
        headers: { accept: '*/*' },
        redirect: 'manual',
      });
    },
  );
});

describe('root redirect cache isolation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('should prevent caching a marketing root redirect after rewriting its location', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: '/pricing/', 'cache-control': 'public, max-age=600' },
          }),
      ),
    );
    const response = await marketing(new Request('https://tau.new/'), { next: vi.fn() });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://tau.new/pricing/');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('should keep app-preferring visitors on marketing subpages and preserve their cache policy', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('pricing', { headers: { 'cache-control': 'public, max-age=600' } })),
    );
    const response = await marketing(
      new Request('https://tau.new/pricing/', { headers: { cookie: 'tau-entry=app' } }),
      { next: vi.fn() },
    );
    expect(await response.text()).toBe('pricing');
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
  });
});
