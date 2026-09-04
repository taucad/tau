import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  appOrigin,
  appScheme,
  appSchemePrivileges,
  registerAppProtocol,
  resolveAppRequest,
} from '#main/app-protocol.js';

const clientRoot = mkdtempSync(join(tmpdir(), 'tau-app-protocol-'));
mkdirSync(join(clientRoot, 'assets'), { recursive: true });
writeFileSync(join(clientRoot, 'index.html'), '<!doctype html>');
writeFileSync(join(clientRoot, 'assets', 'entry.js'), 'export {};');
writeFileSync(join(clientRoot, 'module.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
const outsideRoot = mkdtempSync(join(tmpdir(), 'tau-app-outside-'));
writeFileSync(join(outsideRoot, 'secret.txt'), 'nope');

afterAll(() => {
  /* Left for the OS: these are tmpdir directories and removing them races the
   * `existsSync` calls above on a re-run. */
});

describe('appSchemePrivileges', () => {
  it('registers the scheme with the four privileges the SPA needs plus the V8 code cache', () => {
    expect(appSchemePrivileges).toEqual([
      {
        scheme: appScheme,
        /* `codeCache` is only honoured on a `standard` scheme, and only from
         * Electron 28 — the built SPA is byte-identical on every launch, so
         * without it V8 recompiles the whole bundle each cold start. */
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Electron's privilege keys are not camelCase
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
      },
    ]);
  });
});

describe('resolveAppRequest', () => {
  it('serves an existing asset', () => {
    expect(resolveAppRequest(`${appOrigin}/assets/entry.js`, clientRoot)).toBe(join(clientRoot, 'assets', 'entry.js'));
  });

  it('falls back to index.html for every client route', () => {
    const index = join(clientRoot, 'index.html');
    expect(resolveAppRequest(`${appOrigin}/`, clientRoot)).toBe(index);
    expect(resolveAppRequest(`${appOrigin}/w/acme/widget`, clientRoot)).toBe(index);
    expect(resolveAppRequest(`${appOrigin}/import/github/owner/repo`, clientRoot)).toBe(index);
  });

  it('404s a missing asset rather than answering it with HTML', () => {
    /* Answering a missing module script with `index.html` produces a strict
     * MIME failure that reads like a bundler bug. */
    expect(resolveAppRequest(`${appOrigin}/assets/absent.js`, clientRoot)).toBeUndefined();
  });

  it('refuses traversal, plain and percent-encoded', () => {
    expect(resolveAppRequest(`${appOrigin}/../${'secret.txt'}`, clientRoot)).toBeUndefined();
    expect(resolveAppRequest(`${appOrigin}/%2e%2e%2f%2e%2e%2fsecret.txt`, clientRoot)).toBeUndefined();
    expect(resolveAppRequest(`${appOrigin}/assets/../../secret.txt`, clientRoot)).toBeUndefined();
  });

  it('refuses another host or scheme on the same handler', () => {
    expect(resolveAppRequest('app://elsewhere/index.html', clientRoot)).toBeUndefined();
    expect(resolveAppRequest('https://tau/index.html', clientRoot)).toBeUndefined();
    expect(resolveAppRequest('not a url', clientRoot)).toBeUndefined();
  });
});

describe('registerAppProtocol response headers', () => {
  /**
   * Capture the handler `registerAppProtocol` installs and drive it directly.
   *
   * @returns The handler plus the `net.fetch` stub it calls.
   */
  const handlerFor = () => {
    let handler: ((request: Request) => Promise<Response> | Response) | undefined;
    const fetched: string[] = [];
    registerAppProtocol({
      clientRoot,
      protocol: {
        handle: (scheme, installed) => {
          expect(scheme).toBe(appScheme);
          handler = installed;
        },
      },
      /* Stands in for Electron's file:// reader, which guesses a content type
       * this handler then pins for the five that must not be guessed wrong. */
      net: {
        fetch: async (url) => {
          fetched.push(url);
          return new Response('body', { headers: { 'content-type': 'application/octet-stream' } });
        },
      },
    });
    if (!handler) {
      throw new Error('registerAppProtocol installed no handler');
    }
    return { handler, fetched };
  };

  it('carries the full cross-origin-isolation set on a worker script response', async () => {
    /* The load-bearing one: a module worker's own script response must carry
     * COEP or Chromium refuses it with NotSameOriginAfterDefaultedToSameOriginByCoep,
     * and `webRequest.onHeadersReceived` cannot deliver it over protocol.handle. */
    const { handler } = handlerFor();
    const response = await handler(new Request(`${appOrigin}/assets/entry.js`));
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('carries the same set on the document, matching what the session installer upserts', async () => {
    const { handler } = handlerFor();
    const response = await handler(new Request(`${appOrigin}/w/acme/widget`));
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('pins the content types that must not be guessed, and keeps the isolation headers with them', async () => {
    const { handler } = handlerFor();
    for (const [path, type] of [
      ['/assets/entry.js', 'text/javascript; charset=utf-8'],
      ['/module.wasm', 'application/wasm'],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- two cheap cases
      const response = await handler(new Request(`${appOrigin}${path}`));
      expect([path, response.headers.get('content-type')]).toEqual([path, type]);
      expect([path, response.headers.get('cross-origin-embedder-policy')]).toEqual([path, 'require-corp']);
    }
  });

  it('404s a missing asset without reading the disk', async () => {
    const { handler, fetched } = handlerFor();
    const response = await handler(new Request(`${appOrigin}/assets/absent.js`));
    expect(response.status).toBe(404);
    expect(fetched).toEqual([]);
  });
});
