import { describe, expect, it } from 'vitest';
/* oxlint-disable eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root. */
import staticShell, {
  config,
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

describe('static shell edge function', () => {
  it('should expire the skew cookie on a cache hit, which arrives without it', async () => {
    const response = await staticShell(new Request('https://tau.new/w/home/bracket-v2'), {
      next: async () => cachedShell(),
    });
    expect(response.headers.getSetCookie()).toStrictEqual([shellSkewCookieExpiry]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<!doctype html><title>Tau</title>');
  });

  it('should keep every header of the static file, so the shell keeps parity with function documents', async () => {
    const response = await staticShell(new Request('https://tau.new/w/home/bracket-v2'), {
      next: async () => cachedShell(),
    });
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

  it('should be bypassed on failure, so an error serves the file rather than an error page', () => {
    expect(config.onError).toBe('bypass');
  });
});
