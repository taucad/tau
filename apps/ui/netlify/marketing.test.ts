import { afterEach, describe, expect, it, vi } from 'vitest';
/* oxlint-disable eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root. */
import marketing, {
  config,
  homeShellDocument,
  prefersAppEntry,
  resolveMarketingUrl,
  rewriteLocation,
  rootDataPaths,
  shellSkewCookie,
} from './edge-functions/marketing.js';
/* oxlint-enable eslint/no-restricted-imports */

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
    expect(resolve('/?app')).toBeUndefined();
    expect(resolve('/?utm_source=x&ref=hn')).toBe(`${origin}/`);
  });

  it('should route marketing data while preserving app data ownership', () => {
    expect(resolve('/pricing.data?_routes=www-page&code=secret')).toBe(`${origin}/pricing.data?_routes=www-page`);
    expect(resolve('/vision.data?_routes=www-vision')).toBe(`${origin}/vision.data?_routes=www-vision`);
    expect(resolve('/sitemap-marketing.xml')).toBe(`${origin}/sitemap.xml`);
  });

  /* React Router 7 names the root data request `/_root.data`; trailing-slash-aware data requests (React Router 8's
   * default) name it `/_.data`. A tab of either build may be open, so both stay accepted (RR4). */
  it.each(['/_root.data', '/_.data'])(
    'should route marketing Home data at %s, by its name, and app data to the app',
    (path) => {
      expect(rootDataPaths).toContain(path);
      expect(resolve(`${path}?_routes=www-home`)).toBe(`${origin}${path}?_routes=www-home`);
      expect(resolve(`${path}?_routes=www-home&code=secret`)).toBe(`${origin}${path}?_routes=www-home`);
      expect(resolve(path)).toBeUndefined();
      expect(resolve(`${path}?_routes=root,routes/_index`)).toBeUndefined();
      expect(resolve(`${path}?_routes=www-home,routes/_index`)).toBeUndefined();
      expect(resolve(`${path}?_routes=www-home`, 'POST')).toBeUndefined();
    },
  );

  it('should route the trailing-slash data requests of marketing pages by their prefix', () => {
    expect(resolve('/pricing/_.data?_routes=www-pricing')).toBe(`${origin}/pricing/_.data?_routes=www-pricing`);
    expect(resolve('/legal/privacy/_.data?_routes=www-legal-privacy&ref=hn')).toBe(
      `${origin}/legal/privacy/_.data?_routes=www-legal-privacy`,
    );
    expect(resolve('/blog/_.data?_routes=www-blog')).toBe(`${origin}/blog/_.data?_routes=www-blog`);
    // App data, with or without a trailing slash, stays on the app.
    for (const path of ['/projects/_.data', '/w/home/_.data', '/pricingx/_.data', '/settings/_.data']) {
      expect(resolve(`${path}?_routes=root`)).toBeUndefined();
    }
  });

  it('should serve the agent page from the marketing origin, leaving the other LLM indexes to the docs redirects', () => {
    expect(resolve('/llms.txt')).toBe(`${origin}/llms.txt`);
    expect(resolve('/llms.txt?ref=hn')).toBe(`${origin}/llms.txt`);
    for (const path of ['/llms-full.txt', '/llms.mdx', '/llms.txt/x', '/docs/runtime/llms.txt']) {
      expect(resolve(path)).toBeUndefined();
    }
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
    expect(config.path).toContain('/llms.txt');
  });

  it("should register both names of the root data request, and each marketing page's trailing-slash data request", () => {
    expect(config.path).toContain('/_root.data');
    expect(config.path).toContain('/_.data');
    // `<prefix>/_.data` is under `<prefix>/*`, `<prefix>.data` is listed itself.
    expect(config.path).toContain('/pricing/*');
    expect(config.path).toContain('/pricing.data');
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
              new Response(method === 'HEAD' ? null : 'app', {
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
          expect(await response.text()).toBe(method === 'HEAD' ? '' : 'app');
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

describe('marketing staging links before JavaScript', () => {
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
  const prompt = (site: string): string =>
    `<code id="agent-prompt-text">Install the Tau plugin from ${site}/llms.txt</code>`;
  const html = `<link rel="canonical" href="https://tau.new/download/">${scripts}${prompt('https://tau.new')}${files.map((file) => `<a class="text-link" href="https://downloads.tau.new/latest/${file}" data-event="download">Download</a>`).join('')}<a href="https://docs.tau.new/">Docs</a><a class="text-link" href="https://docs.tau.new/editor/packages">Packages</a>`;

  it('should serve every archive link and the agent prompt from staging while preserving scripts and document policies', async () => {
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
    expect([...body.replace(scripts, '').matchAll(/<a[^>]+href="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      ...files.map((file) => `https://downloads.taucad.dev/latest/${file}`),
      'https://docs.taucad.dev/',
      'https://docs.taucad.dev/editor/packages',
    ]);
    expect(body).toContain(scripts);
    expect(body).toContain(prompt('https://taucad.dev'));
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

describe('marketing policy per environment', () => {
  afterEach(() => vi.unstubAllGlobals());
  const production =
    "default-src 'self'; script-src 'self' 'nonce-abc'; connect-src 'self' https://api.tau.new https://downloads.tau.new; object-src 'none'";
  const staging =
    "default-src 'self'; script-src 'self' 'nonce-abc'; connect-src 'self' https://api.taucad.dev https://downloads.taucad.dev; object-src 'none'";
  const linked = '<a class="text-link" href="https://downloads.tau.new/latest/Tau-linux-x64.tar.gz">Download</a>';
  const plain = '<h1>Tau</h1>';

  async function serve(url: string, body: string | undefined, method = 'GET'): Promise<Response> {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body ?? null, {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              etag: '"upstream"',
              'content-security-policy': production,
            },
          }),
      ),
    );
    return marketing(new Request(url, { method }), { next: vi.fn() });
  }

  it('should select staging hosts in the policy when the body needs no rewrite, keeping its bytes and validators', async () => {
    const response = await serve('https://taucad.dev/', plain);
    expect(response.headers.get('content-security-policy')).toBe(staging);
    expect(response.headers.get('etag')).toBe('"upstream"');
    expect(await response.text()).toBe(plain);
  });

  it('should select staging hosts in the policy when the body is rewritten', async () => {
    const response = await serve('https://taucad.dev/download/', linked);
    expect(response.headers.get('content-security-policy')).toBe(staging);
    expect(await response.text()).toContain('https://downloads.taucad.dev/latest/Tau-linux-x64.tar.gz');
  });

  it('should select staging hosts in the policy behind the staging router', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(plain, {
            headers: {
              'content-type': 'text/html',
              'content-security-policy': production,
            },
          }),
      ),
    );
    const response = await marketing(
      new Request('https://staging--taucad-staging.netlify.app/', {
        headers: { 'x-tau-public-host': 'taucad.dev' },
      }),
      { next: vi.fn() },
    );
    expect(response.headers.get('content-security-policy')).toBe(staging);
  });

  it('should select staging hosts in the policy of a HEAD response', async () => {
    const response = await serve('https://taucad.dev/download/', undefined, 'HEAD');
    expect(response.headers.get('content-security-policy')).toBe(staging);
  });

  it.each(['https://tau.new/', 'https://tau.new/download/', 'https://taucad.dev.example/'])(
    'should leave the production policy untouched on %s',
    async (url) => {
      const response = await serve(url, url.endsWith('/download/') ? linked : plain);
      expect(response.headers.get('content-security-policy')).toBe(production);
      expect(response.headers.get('content-security-policy')).not.toContain('taucad.dev');
    },
  );

  it('should not rewrite a host that only starts with a production host name', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    const policy = "connect-src 'self' https://api.tau.new.example https://api.tau.new";
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(plain, {
            headers: {
              'content-type': 'text/html',
              'content-security-policy': policy,
            },
          }),
      ),
    );
    const response = await marketing(new Request('https://taucad.dev/'), {
      next: vi.fn(),
    });
    expect(response.headers.get('content-security-policy')).toBe(
      "connect-src 'self' https://api.tau.new.example https://api.taucad.dev",
    );
  });
});

describe('staging router public host', () => {
  afterEach(() => vi.unstubAllGlobals());
  const alias = 'https://staging--taucad-staging.netlify.app';

  async function redirectFor(url: string, publicHost?: string): Promise<string | undefined> {
    vi.stubGlobal('Netlify', { env: { get: () => origin } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 301, headers: { location: `${origin}/pricing/` } })),
    );
    const headers: Record<string, string> = publicHost === undefined ? {} : { 'x-tau-public-host': publicHost };
    const response = await marketing(new Request(url, { headers }), { next: vi.fn() });
    return response.headers.get('location') ?? undefined;
  }

  it('should keep marketing redirects on the domain the router proxied from', async () => {
    expect(await redirectFor(`${alias}/pricing`, 'taucad.dev')).toBe('https://taucad.dev/pricing/');
  });

  it.each([
    ['https://tau.new/pricing', 'evil.example', 'https://tau.new/pricing/'],
    [`${alias}/pricing`, 'evil.example/path', `${alias}/pricing/`],
    [`${alias}/pricing`, undefined, `${alias}/pricing/`],
  ])('should ignore a public host the router did not set: %s with %j', async (url, publicHost, location) => {
    expect(await redirectFor(url, publicHost)).toBe(location);
  });
});

describe('prefersAppEntry', () => {
  it.each([
    ['tau-entry=app', true],
    ['other=x; tau-entry=app', true],
    ['  tau-entry=app  ;theme=dark', true],
    [undefined, false],
    ['', false],
    ['tau-entry=website', false],
    ['tau-entry=', false],
    ['tau-entry=apple', false],
    ['tau-entry=App', false],
    ['tau-entry="app"', false],
    ['TAU-ENTRY=app', false],
    ['not-tau-entry=app', false],
    ['xtau-entry=app', false],
    ['tau-entry=app; tau-entry=website', false],
    ['tau-entry=app; tau-entry=app', false],
  ])('should read %j as an app preference: %s', (cookie, expected) => {
    expect(prefersAppEntry(cookie)).toBe(expected);
  });
});

/**
 * Home shell at `/` (progressive loading PL4). A visitor with the `tau-entry=app` preference gets the prerendered Home
 * shell where the function rendered Home before; who gets marketing and who gets the app does not change. Every row
 * below is one request shape and the document it must get:
 *
 * - `shell`: the static Home shell, through `context.next` with the shell's URL;
 * - `function`: `context.next` with the request as sent (the React Router function, as before);
 * - `marketing`: a fetch of the marketing deploy (as before).
 */
describe('Home shell selection at / (PL4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const crawler = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  type Served = 'shell' | 'function' | 'marketing';
  type Shape = Readonly<{
    href: string;
    method?: string;
    cookie?: string;
    headers?: Record<string, string>;
    origin?: string | undefined;
    shellStatus?: number;
  }>;

  /** Serve one request through the edge function with a stand-in origin, and say which document it got. */
  const serve = async ({ href, method = 'GET', cookie, headers = {}, shellStatus = 200, ...rest }: Shape) => {
    const marketingOrigin = 'origin' in rest ? rest.origin : origin;
    vi.stubGlobal('Netlify', {
      env: { get: (name: string) => (name === 'MARKETING_ORIGIN' ? marketingOrigin : undefined) },
    });
    const fetch = vi.fn(
      async () => new Response(method === 'HEAD' ? null : 'marketing', { headers: { 'content-type': 'text/html' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const requests: Request[] = [];
    const next = vi.fn(async (forwarded?: Request) => {
      const sent = forwarded ?? request;
      requests.push(sent);
      const isShell = new URL(sent.url).pathname === homeShellDocument;
      const body = isShell ? 'shell' : 'function';
      return new Response(sent.method === 'HEAD' ? null : body, {
        status: isShell ? shellStatus : 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-served': body,
          etag: '"static"',
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-vary': 'cookie=tau-entry',
        },
      });
    });
    const request = new Request(href, {
      method,
      headers: { ...(cookie === undefined ? {} : { cookie }), ...headers },
    });
    const response = await marketing(request, { next });
    const served: Served = fetch.mock.calls.length > 0 ? 'marketing' : (response.headers.get('x-served') as Served);
    return { served, response, requests, fetch };
  };

  it.each<[string, Shape, Served]>([
    // The preference, on every URL shape of `/` that the app answers.
    ['bare GET', { href: 'https://tau.new/', cookie: 'tau-entry=app' }, 'shell'],
    ['HEAD', { href: 'https://tau.new/', method: 'HEAD', cookie: 'tau-entry=app' }, 'shell'],
    [
      'among other cookies',
      { href: 'https://tau.new/', cookie: 'tau-theme=dark; tau-entry=app; tau_skew=old' },
      'shell',
    ],
    ['an empty query', { href: 'https://tau.new/?', cookie: 'tau-entry=app' }, 'shell'],
    ['campaign parameters', { href: 'https://tau.new/?utm_source=mail&ref=hn', cookie: 'tau-entry=app' }, 'shell'],
    ['the open-app link', { href: 'https://tau.new/?app', cookie: 'tau-entry=app' }, 'shell'],
    ['an OAuth return', { href: 'https://tau.new/?code=abc&state=xyz', cookie: 'tau-entry=app' }, 'shell'],
    ['an app dialog', { href: 'https://tau.new/?settings=billing', cookie: 'tau-entry=app' }, 'shell'],
    ['a look-alike of website', { href: 'https://tau.new/?Website', cookie: 'tau-entry=app' }, 'shell'],
    ['a crawler', { href: 'https://tau.new/', cookie: 'tau-entry=app', headers: { 'user-agent': crawler } }, 'shell'],
    ['staging', { href: 'https://taucad.dev/', cookie: 'tau-entry=app' }, 'shell'],
    [
      'staging behind its router',
      {
        href: 'https://staging--taucad-staging.netlify.app/',
        cookie: 'tau-entry=app',
        headers: { 'x-tau-public-host': 'taucad.dev' },
      },
      'shell',
    ],
    [
      'a site with no marketing deploy',
      { href: 'https://tau.new/', cookie: 'tau-entry=app', origin: undefined },
      'shell',
    ],
    // The preference, where the app answers but not with the shell: exactly as before.
    [
      'the www alias, which the root loader redirects',
      { href: 'https://www.tau.new/', cookie: 'tau-entry=app' },
      'function',
    ],
    ['POST', { href: 'https://tau.new/', method: 'POST', cookie: 'tau-entry=app' }, 'function'],
    ['OPTIONS', { href: 'https://tau.new/', method: 'OPTIONS', cookie: 'tau-entry=app' }, 'function'],
    [
      'website with an app parameter',
      { href: 'https://tau.new/?website&code=abc', cookie: 'tau-entry=app' },
      'function',
    ],
    ['Home data', { href: 'https://tau.new/_root.data', cookie: 'tau-entry=app' }, 'function'],
    [
      'Home data for its routes',
      { href: 'https://tau.new/_root.data?_routes=root,routes/_index', cookie: 'tau-entry=app' },
      'function',
    ],
    ['Home data by its trailing-slash name', { href: 'https://tau.new/_.data', cookie: 'tau-entry=app' }, 'function'],
    [
      'Home data for its routes by its trailing-slash name',
      { href: 'https://tau.new/_.data?_routes=root,routes/_index', cookie: 'tau-entry=app' },
      'function',
    ],
    // The preference, where marketing answers: exactly as before.
    ['the website escape', { href: 'https://tau.new/?website', cookie: 'tau-entry=app' }, 'marketing'],
    [
      'the website escape with a value',
      { href: 'https://tau.new/?website=1&utm_source=x', cookie: 'tau-entry=app' },
      'marketing',
    ],
    ['a marketing page', { href: 'https://tau.new/pricing/', cookie: 'tau-entry=app' }, 'marketing'],
    [
      'marketing Home data',
      { href: 'https://tau.new/_root.data?_routes=www-home', cookie: 'tau-entry=app' },
      'marketing',
    ],
    [
      'marketing Home data by its trailing-slash name',
      { href: 'https://tau.new/_.data?_routes=www-home', cookie: 'tau-entry=app' },
      'marketing',
    ],
    ['no cookie, marketing Home data', { href: 'https://tau.new/_root.data?_routes=www-home' }, 'marketing'],
    [
      'no cookie, marketing Home data by its trailing-slash name',
      { href: 'https://tau.new/_.data?_routes=www-home' },
      'marketing',
    ],
    [
      "no cookie, a marketing page's trailing-slash data",
      { href: 'https://tau.new/pricing/_.data?_routes=www-pricing' },
      'marketing',
    ],
    // No preference, another preference or an ambiguous one: exactly as before.
    ['no cookie', { href: 'https://tau.new/' }, 'marketing'],
    ['no cookie, HEAD', { href: 'https://tau.new/', method: 'HEAD' }, 'marketing'],
    ['no cookie, a crawler', { href: 'https://tau.new/', headers: { 'user-agent': crawler } }, 'marketing'],
    ['no cookie, the www alias', { href: 'https://www.tau.new/' }, 'marketing'],
    ['no cookie, campaign parameters', { href: 'https://tau.new/?utm_campaign=launch' }, 'marketing'],
    ['the website preference', { href: 'https://tau.new/', cookie: 'tau-entry=website' }, 'marketing'],
    ['another value', { href: 'https://tau.new/', cookie: 'tau-entry=apple' }, 'marketing'],
    ['a quoted value', { href: 'https://tau.new/', cookie: 'tau-entry="app"' }, 'marketing'],
    ['a look-alike name', { href: 'https://tau.new/', cookie: 'not-tau-entry=app' }, 'marketing'],
    ['two conflicting cookies', { href: 'https://tau.new/', cookie: 'tau-entry=app; tau-entry=website' }, 'marketing'],
    ['two equal cookies', { href: 'https://tau.new/', cookie: 'tau-entry=app; tau-entry=app' }, 'marketing'],
    ['no cookie, the open-app link', { href: 'https://tau.new/?app' }, 'function'],
    ['no cookie, an OAuth return', { href: 'https://tau.new/?code=abc' }, 'function'],
    ['no cookie, POST', { href: 'https://tau.new/', method: 'POST' }, 'function'],
    ['no cookie, no marketing deploy', { href: 'https://tau.new/', origin: undefined }, 'function'],
    ['no cookie, Home data', { href: 'https://tau.new/_root.data' }, 'function'],
    ['no cookie, Home data by its trailing-slash name', { href: 'https://tau.new/_.data' }, 'function'],
  ])('should answer %s with the %s document', async (_shape, shape, expected) => {
    const { served, requests } = await serve(shape);
    expect(served).toBe(expected);
    if (expected === 'function') {
      // The request goes on as sent: same URL, method and cookies.
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(new URL(shape.href).href);
      expect(requests[0]?.method).toBe(shape.method ?? 'GET');
    }
  });

  it.each(['GET', 'HEAD'])('should hand %s the shell file of this site, keeping the method', async (method) => {
    const { requests, response } = await serve({
      href: 'https://staging--taucad-staging.netlify.app/?code=abc',
      method,
      cookie: 'tau-entry=app',
      headers: { 'x-tau-public-host': 'taucad.dev' },
    });
    expect(requests).toHaveLength(1);
    // A rewrite stays on the host Netlify received, which is the alias behind the staging router.
    expect(requests[0]?.url).toBe(`https://staging--taucad-staging.netlify.app${homeShellDocument}`);
    expect(requests[0]?.method).toBe(method);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(method === 'HEAD' ? '' : 'shell');
  });

  it('should keep the shell out of shared and browser caches, as both documents at / are', async () => {
    const { response } = await serve({ href: 'https://tau.new/', cookie: 'tau-entry=app' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('netlify-cdn-cache-control')).toBe('no-store');
    expect(response.headers.has('netlify-vary')).toBe(false);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it("should expire the skew cookie, as the project shell does, and not pin the shell's assets", async () => {
    const { response } = await serve({ href: 'https://tau.new/', cookie: 'tau-entry=app; tau_skew=old' });
    expect(response.headers.getSetCookie()).toStrictEqual([shellSkewCookie]);
    expect(shellSkewCookie).toBe('tau_skew=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
  });

  it('should leave the cookies of a function document at / as the function set them', async () => {
    const { response } = await serve({ href: 'https://tau.new/?app' });
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });

  it.each([404, 500])('should fall back to the function when the deploy answers the shell with %i', async (status) => {
    const { served, requests, response } = await serve({
      href: 'https://tau.new/?code=abc',
      cookie: 'tau-entry=app',
      shellStatus: status,
    });
    expect(served).toBe('function');
    expect(requests.map((sent) => new URL(sent.url).pathname + new URL(sent.url).search)).toStrictEqual([
      homeShellDocument,
      '/?code=abc',
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });
});
