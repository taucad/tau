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
    expect(resolve('/vision')).toBe(`${origin}/vision`);
    expect(resolve('/vision/')).toBe(`${origin}/vision/`);
    expect(resolve('/_www/assets/site.css')).toBe(`${origin}/_www/assets/site.css`);
  });

  it('should serve the legal documents the app and email link to from the marketing origin', () => {
    expect(resolve('/legal')).toBe(`${origin}/legal`);
    expect(resolve('/legal/privacy')).toBe(`${origin}/legal/privacy`);
    expect(resolve('/legal/open-source/')).toBe(`${origin}/legal/open-source/`);
    expect(resolve('/legal/privacy.data?_routes=www-legal-privacy')).toBe(
      `${origin}/legal/privacy.data?_routes=www-legal-privacy`,
    );
  });

  it('should keep app routes, including look-alike prefixes, on the app', () => {
    for (const path of ['/projects', '/visionary', '/legalese', '/settings/billing', '/pricingx', '/assets/a.js']) {
      expect(resolve(path)).toBeUndefined();
    }
  });

  it('should keep the app homepage for app query parameters and allow campaign parameters', () => {
    expect(resolve('/?settings=billing')).toBeUndefined();
    expect(resolve('/?code=abc')).toBeUndefined();
    expect(resolve('/?utm_source=x&ref=hn')).toBe(`${origin}/`);
  });

  it('should route marketing data while preserving app data ownership', () => {
    expect(resolve('/pricing.data?_routes=www-page&code=secret')).toBe(`${origin}/pricing.data?_routes=www-page`);
    expect(resolve('/_root.data?_routes=www-home')).toBe(`${origin}/_root.data?_routes=www-home`);
    expect(resolve('/_root.data')).toBeUndefined();
    expect(resolve('/_root.data?_routes=root,routes/home')).toBeUndefined();
    expect(resolve('/vision.data?_routes=www-vision')).toBe(`${origin}/vision.data?_routes=www-vision`);
    expect(resolve('/sitemap-marketing.xml')).toBe(`${origin}/sitemap.xml`);
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
    expect(config.path).toContain('/legal');
    expect(config.path).toContain('/legal/*');
    expect(config.path).toContain('/vision');
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
              new Response('app', {
                headers: {
                  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=600',
                },
              }),
          );
          const response = await marketing(
            new Request(`https://tau.new${path}`, {
              method,
              headers: { cookie: 'other=x; tau-entry=app' },
            }),
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
          new Response('marketing', {
            headers: {
              'cache-control': 'public',
              'CDN-Cache-Control': 'public',
            },
          }),
      );
      vi.stubGlobal('fetch', fetch);
      const response = await marketing(
        new Request('https://tau.new/', {
          headers: { cookie, authorization: 'Bearer test' },
        }),
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
            headers: {
              location: '/pricing/',
              'cache-control': 'public, max-age=600',
            },
          }),
      ),
    );
    const response = await marketing(new Request('https://tau.new/'), {
      next: vi.fn(),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://tau.new/pricing/');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('should keep app-preferring visitors on marketing subpages and preserve their cache policy', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('pricing', {
            headers: { 'cache-control': 'public, max-age=600' },
          }),
      ),
    );
    const response = await marketing(
      new Request('https://tau.new/pricing/', {
        headers: { cookie: 'tau-entry=app' },
      }),
      { next: vi.fn() },
    );
    expect(await response.text()).toBe('pricing');
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
  });
});

it('should preserve app crawler resources and expose a separate marketing sitemap', () => {
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    expect(resolveMarketingUrl(new URL(path, 'https://tau.new'), 'GET', origin)).toBeUndefined();
  }
  expect(resolveMarketingUrl(new URL('/sitemap-marketing.xml', 'https://tau.new'), 'GET', origin)?.href).toBe(
    `${origin}/sitemap.xml`,
  );
});

it('should retain app robots restrictions and advertise marketing only on the enabled production host', async () => {
  const body = 'User-agent: *\nDisallow: /projects\nSitemap: https://tau.new/sitemap.xml\n';
  const next = async () => new Response(body, { headers: { 'content-type': 'text/plain' } });
  vi.stubGlobal('Netlify', { env: { get: () => origin } });
  const production = await marketing(new Request('https://tau.new/robots.txt'), { next });
  expect(await production.text()).toBe(`${body}Sitemap: https://tau.new/sitemap-marketing.xml\n`);
  const staging = await marketing(new Request('https://taucad.dev/robots.txt'), { next });
  expect(await staging.text()).toBe(body);
  vi.stubGlobal('Netlify', { env: { get: () => undefined } });
  const disabled = await marketing(new Request('https://tau.new/robots.txt'), { next });
  expect(await disabled.text()).toBe(body);
});

describe('marketing download channel before JavaScript', () => {
  afterEach(() => vi.unstubAllGlobals());
  const files = [
    'Tau-macos-x64.zip',
    'Tau-macos-arm64.zip',
    'Tau-macos-x64.zip',
    'Tau-win32-x64.zip',
    'Tau-linux-x64.tar.gz',
  ];
  const scripts =
    '<script>const anchor = `<a href="https://downloads.tau.new/latest/Tau-macos-arm64.zip">Download</a>`;</script><script type="application/ld+json">{"url":"https://tau.new/download/"}</script>';
  const html = `<link rel="canonical" href="https://tau.new/download/">${scripts}${files.map((file) => `<a class="text-link" href="https://downloads.tau.new/latest/${file}" data-event="download">Download</a>`).join('')}`;

  it('should serve every archive link from staging while preserving scripts and document policies', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(html, {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'content-length': String(html.length),
              'content-encoding': 'gzip',
              etag: '"upstream"',
              'last-modified': 'Wed, 14 Oct 2026 01:00:00 GMT',
              'content-security-policy': "script-src 'self' 'sha256-boot'",
              'cache-control': 'public, max-age=0, must-revalidate',
            },
          }),
      ),
    );
    const response = await marketing(new Request('https://taucad.dev/download/'), { next: vi.fn() });
    const body = await response.text();
    expect([...body.replace(scripts, '').matchAll(/<a[^>]+href="([^"]+)"/gu)].map((match) => match[1])).toEqual(
      files.map((file) => `https://downloads.taucad.dev/latest/${file}`),
    );
    expect(body).toContain(scripts);
    expect(body).toContain('<link rel="canonical" href="https://tau.new/download/">');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe("script-src 'self' 'sha256-boot'");
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    for (const header of ['content-length', 'content-encoding', 'etag', 'last-modified']) {
      expect(response.headers.has(header)).toBe(false);
    }
  });

  it.each([
    ['https://tau.new/download/', 'GET', 'text/html'],
    ['https://taucad.dev.example/download/', 'GET', 'text/html'],
    ['https://taucad.dev/_www/assets/site.js', 'GET', 'application/javascript'],
    ['https://taucad.dev/download/', 'HEAD', 'text/html'],
  ])('should preserve upstream bytes and validators for %s %s %s', async (url, method, contentType) => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(method === 'HEAD' ? null : html, {
            headers: {
              'content-type': contentType,
              etag: '"upstream"',
            },
          }),
      ),
    );
    const response = await marketing(new Request(url, { method }), { next: vi.fn() });
    expect(await response.text()).toBe(method === 'HEAD' ? '' : html);
    expect(response.headers.get('etag')).toBe('"upstream"');
  });
});
