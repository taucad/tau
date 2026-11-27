import { describe, expect, it } from 'vitest';
/* oxlint-disable eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root. */
import staticShell, {
  config,
  projectShellDocument,
  shellSkewCookieExpiry,
  withShellSkewCookieExpiry,
} from './edge-functions/static-shell.js';
/* oxlint-enable eslint/no-restricted-imports */

const shellHeaders = {
  'content-type': 'text/html; charset=UTF-8',
  'cache-control': 'public,max-age=0,must-revalidate',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  etag: 'W/"shell"',
};

/** A static shell response as the edge cache answers it on a hit: the file's headers, no `Set-Cookie`. */
const cachedShell = (status = 200): Response =>
  new Response(status === 304 ? null : '<!doctype html><title>Tau</title>', { status, headers: shellHeaders });

/** Netlify's edge context over a site whose shell file answers `shell`, recording each request the chain continues with. */
const site = (shell: () => Response, origin = (): Response => new Response('function document')) => {
  const seen: Request[] = [];
  return {
    seen,
    context: {
      next: async (request?: Request): Promise<Response> => {
        if (request !== undefined) {
          seen.push(request);
        }
        return request !== undefined && new URL(request.url).pathname === projectShellDocument ? shell() : origin();
      },
    },
  };
};

describe('static shell edge function', () => {
  it("should rewrite a project URL to the shell's file, keeping the request's method and headers", async () => {
    const { seen, context } = site(() => cachedShell());
    const request = new Request('https://tau.new/w/home/bracket-v2?chat=chat_01', {
      headers: { 'if-none-match': 'W/"shell"' },
    });
    const response = await staticShell(request, context);
    expect(seen.map((forwarded) => forwarded.url)).toStrictEqual([`https://tau.new${projectShellDocument}`]);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.headers.get('if-none-match')).toBe('W/"shell"');
    expect(await response.text()).toBe('<!doctype html><title>Tau</title>');
  });

  it('should serve a 304 revalidation of the shell, with the expiry', async () => {
    const response = await staticShell(
      new Request('https://tau.new/w/home/bracket-v2'),
      site(() => cachedShell(304)).context,
    );
    expect(response.status).toBe(304);
    expect(response.headers.getSetCookie()).toStrictEqual([shellSkewCookieExpiry]);
  });

  it('should hand the request to the function when the shell file is not served', async () => {
    const { seen, context } = site(() => new Response('missing', { status: 404 }));
    const request = new Request('https://tau.new/w/home/bracket-v2');
    const response = await staticShell(request, context);
    expect(seen.map((forwarded) => forwarded.url)).toStrictEqual([
      `https://tau.new${projectShellDocument}`,
      'https://tau.new/w/home/bracket-v2',
    ]);
    expect(await response.text()).toBe('function document');
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });

  it('should pass the www alias on, so the redirect to the apex answers it', async () => {
    const { seen, context } = site(() => cachedShell());
    const response = await staticShell(new Request('https://www.tau.new/w/home/bracket-v2'), context);
    expect(seen.map((forwarded) => forwarded.url)).toStrictEqual(['https://www.tau.new/w/home/bracket-v2']);
    expect(await response.text()).toBe('function document');
  });

  it('should expire the skew cookie on a cache hit, which arrives without it', async () => {
    const response = await staticShell(
      new Request('https://tau.new/w/home/bracket-v2'),
      site(() => cachedShell()).context,
    );
    expect(response.headers.getSetCookie()).toStrictEqual([shellSkewCookieExpiry]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<!doctype html><title>Tau</title>');
  });

  it('should keep every header of the static file, so the shell keeps parity with function documents', async () => {
    const response = await staticShell(
      new Request('https://tau.new/w/home/bracket-v2'),
      site(() => cachedShell()).context,
    );
    for (const [name, value] of Object.entries(shellHeaders)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  it('should expire it on a revalidation, whose cookies the browser applies', async () => {
    const response = withShellSkewCookieExpiry(cachedShell(304));
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.getSetCookie()).toStrictEqual([shellSkewCookieExpiry]);
    expect(response.headers.get('etag')).toBe('W/"shell"');
  });

  it('should send one expiry when the header rule already set it, on a cache fill', () => {
    const filled = new Response('<!doctype html>', {
      headers: { ...shellHeaders, 'set-cookie': shellSkewCookieExpiry },
    });
    expect(withShellSkewCookieExpiry(filled).headers.getSetCookie()).toStrictEqual([shellSkewCookieExpiry]);
  });

  it('should be bypassed on failure, so the function renders the document rather than an error page', () => {
    expect(config.onError).toBe('bypass');
  });
});
