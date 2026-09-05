/**
 * Serve mode (rung 5′): the daemon hands the browser a prebuilt Tau UI from its
 * own origin, so the chat socket is same-origin and no Local Network Access
 * prompt exists on any browser — including Safari, which never fires `close`
 * for a blocked request and therefore cannot be probed.
 *
 * The isolation headers are the second reason this exists: Tau's UI wants
 * `SharedArrayBuffer` (wasm threads), which requires cross-origin isolation.
 *
 * OQ-T1 (origin/auth hand-off) is answered the minimal way: the daemon proxies
 * gateway auth with its own paired credential, so the served UI never needs a
 * tau.new session for a daemon-placed run. The one secret the page does need —
 * admission to `${pathPrefix}/agent` — rides an `HttpOnly` cookie set on this
 * response, which the browser replays on the same-origin upgrade. No token is
 * ever written into the page, so the UI build stays byte-identical to the one
 * the cloud serves.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, normalize, resolve, sep } from 'node:path';

/** Extension → content type. Anything unlisted is served as a byte stream. */
const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Cross-origin isolation, so the served page may use `SharedArrayBuffer`.
 * `require-corp` only constrains *cross-origin* subresources; a self-contained
 * build has none, and every same-origin asset still needs the explicit CORP.
 *
 * @public
 */
export const isolationHeaders: Readonly<Record<string, string>> = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
};

const extensionOf = (pathname: string): string => {
  const dot = pathname.lastIndexOf('.');
  const slash = pathname.lastIndexOf('/');
  return dot > slash ? pathname.slice(dot).toLowerCase() : '';
};

/** Options for {@link serveStaticUi}. @public */
export type StaticUiOptions = {
  /** Absolute directory of the prebuilt UI. */
  readonly root: string;
  /** Session cookie name handed to the page. */
  readonly cookieName: string;
  /** Session cookie value: the daemon's channel admission secret. */
  readonly cookieValue: string;
};

/** A request handler for the daemon's static UI. @public */
export type StaticUiHandler = {
  handle(request: IncomingMessage, response: ServerResponse): void;
};

/**
 * Build the daemon's static UI handler.
 *
 * @param options - Build root and the session cookie handed to the page.
 * @returns A request handler answering `GET`/`HEAD` under the root.
 * @public
 *
 * @example <caption>Serve a prebuilt UI</caption>
 * ```typescript
 * import { serveStaticUi } from '@taucad/host';
 *
 * const ui = serveStaticUi({ root: '/opt/tau/ui', cookieName: 'tau_host_session', cookieValue: 'secret' });
 * ```
 */
export const serveStaticUi = (options: StaticUiOptions): StaticUiHandler => {
  const root = resolve(options.root);
  /* `HttpOnly` keeps the secret out of script reach, `SameSite=Strict` keeps a
   * foreign page from driving the daemon through the user's browser, and the
   * absence of `Secure` is deliberate: a loopback origin is plain http. */
  const sessionCookie = `${options.cookieName}=${options.cookieValue}; Path=/; HttpOnly; SameSite=Strict`;

  const send = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    /* Normalize *then* contain: a `..` segment that escapes the root is a
     * traversal attempt, and a normalized prefix check is the only honest test. */
    const requested = resolve(join(root, normalize(pathname)));
    if (requested !== root && !requested.startsWith(root + sep)) {
      response.writeHead(403, { ...isolationHeaders, 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden\n');
      return;
    }
    const candidate = await stat(requested).catch(() => undefined);
    /* A directory, or a client-routed path with no extension, is the SPA shell.
     * A missing *asset* is a real 404 — answering it with HTML would turn a
     * stale build reference into a silent MIME error in the console. */
    const target =
      candidate?.isFile() === true
        ? requested
        : (candidate?.isDirectory() ?? true) && extensionOf(pathname) === ''
          ? join(root, 'index.html')
          : undefined;
    const targetStat = target ? await stat(target).catch(() => undefined) : undefined;
    if (!target || !targetStat?.isFile()) {
      response.writeHead(404, { ...isolationHeaders, 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }
    const extension = extensionOf(target);
    const headers: Record<string, string> = {
      ...isolationHeaders,
      'content-type': contentTypes[extension] ?? 'application/octet-stream',
      'content-length': String(targetStat.size),
    };
    if (extension === '.html') {
      /* Only the shell hands out the session: an asset response would re-set it
       * on every request for no gain, and the shell is what the user navigates. */
      headers['set-cookie'] = sessionCookie;
      headers['cache-control'] = 'no-store';
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  };

  return {
    handle(request, response) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { ...isolationHeaders, allow: 'GET, HEAD' });
        response.end();
        return;
      }
      // async-iife: bootstrap -- node's request listener is synchronous; this is the only place the async send can be fired.
      void (async (): Promise<void> => {
        try {
          await send(request, response);
        } catch {
          if (!response.headersSent) {
            response.writeHead(500, { ...isolationHeaders, 'content-type': 'text/plain; charset=utf-8' });
          }
          response.end();
        }
      })();
    },
  };
};
