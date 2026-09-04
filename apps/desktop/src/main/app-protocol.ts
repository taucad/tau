/**
 * `app://` delivery of the `ui:build:desktop` SPA (work item E3, ruling C5).
 *
 * `file://` cannot carry a routed SPA: it yields an opaque origin (so
 * `location.origin` stringifies to `'null'`, cross-origin isolation is
 * unreachable, and storage is partitioned oddly) and the History API refuses
 * `pushState` across it. A privileged standard scheme fixes all of that at
 * once, which is why the scheme registration must run before `app.whenReady`.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment names and Electron privilege keys are not camelCase */

import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { applyDocumentHeaders } from '@taucad/runtime/cross-origin-isolation';

/** Scheme the renderer document is served from. */
export const appScheme = 'app';
/** Host inside {@link appScheme}. `app://tau/…` is the renderer's origin. */
export const appHost = 'tau';
/** The renderer's document origin in production. */
export const appOrigin = `${appScheme}://${appHost}`;

/**
 * Privileged-scheme registration passed to `protocol.registerSchemesAsPrivileged`.
 *
 * `standard` gives the scheme a real origin (so it is not opaque), `secure`
 * puts it in a secure context (WebCrypto, service workers, `navigator.gpu`),
 * `supportFetchAPI` lets the SPA `fetch` its own chunks and `.wasm`, and
 * `stream` lets large assets be served without buffering. `codeCache` opts the
 * scheme into V8's code cache (Electron >= 28, `standard` schemes only): the
 * built SPA is the same bytes on every launch, so compiling it from scratch
 * each time is pure repeated work.
 */
export const appSchemePrivileges = [
  {
    scheme: appScheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
  },
] as const;

/* Electron infers most types from the file extension when `net.fetch` reads a
 * `file://` URL, but the three that break the SPA outright when guessed wrong
 * are pinned here: a mistyped module script is refused by the strict MIME check,
 * a mistyped `.wasm` fails `instantiateStreaming`, and a mistyped stylesheet is
 * dropped. Everything else rides Electron's own table. */
const pinnedContentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
};

/**
 * Resolve one `app://` request to a file inside the client root.
 *
 * Every path that does not name an existing file falls back to `index.html`:
 * the manifest has 19 client routes plus a `*` catch-all, and the SPA owns
 * routing once it boots. A missing *asset* (a path carrying an extension) is a
 * genuine 404 instead — answering a missing `.js` with HTML produces a strict
 * MIME failure that reads like a bundler bug.
 *
 * @param requestUrl - The full `app://…` request URL.
 * @param clientRoot - Absolute path of `apps/ui/desktop/build/client`.
 * @returns The absolute file to serve, or `undefined` for a 404.
 */
export const resolveAppRequest = (requestUrl: string, clientRoot: string): string | undefined => {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${appScheme}:` || url.hostname !== appHost) {
    return undefined;
  }

  const root = resolve(clientRoot);
  const indexPath = join(root, 'index.html');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }

  /* `normalize` collapses `..` before the containment check, so an encoded
   * `%2e%2e%2f` traversal is compared in its resolved form, not its literal one. */
  const candidate = resolve(root, `.${normalize(pathname)}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return undefined;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return extname(candidate) === '' ? indexPath : undefined;
};

/** The `protocol` surface this module uses, narrowed for tests. */
type ProtocolLike = {
  handle(scheme: string, handler: (request: Request) => Promise<Response> | Response): void;
};

/** The `net` surface this module uses, narrowed for tests. */
type NetLike = { fetch(url: string): Promise<Response> };

/** Options for {@link registerAppProtocol}. */
export type RegisterAppProtocolOptions = {
  /** Absolute path of the built SPA client directory. */
  readonly clientRoot: string;
  /** Electron's `protocol` module. */
  readonly protocol: ProtocolLike;
  /** Electron's `net` module. */
  readonly net: NetLike;
  /**
   * `Content-Security-Policy` for every response. Set here rather than through
   * the session installer for the same reason COEP is: Electron does not run
   * `onHeadersReceived` over `protocol.handle` responses.
   */
  readonly contentSecurityPolicy?: string | undefined;
};

/**
 * Serve the built SPA over `app://tau`.
 *
 * **Every** response carries the canonical cross-origin-isolation header set,
 * not just the document. `installElectronRuntimeHeaders` cannot supply it here
 * for two independent reasons: its `webRequest` filter is `mainFrame`/`subFrame`
 * only, and Electron does not run `onHeadersReceived` over `protocol.handle`
 * worker responses at all. The consequence is not subtle — a module worker's
 * *script* response must itself carry `Cross-Origin-Embedder-Policy:
 * require-corp` or Chromium refuses it with
 * `NotSameOriginAfterDefaultedToSameOriginByCoep`, which is what took out the
 * file-manager and object-store workers and, with them, the whole composer.
 * `Cross-Origin-Resource-Policy` alone does **not** satisfy it (measured).
 *
 * Reusing `documentHeaders` rather than hand-setting COEP keeps this handler
 * and the session-level installer on one constant, so the two cannot drift or
 * contradict: the installer upserts the same names over document responses
 * afterwards, which is a no-op re-set rather than a conflict. COOP is inert on
 * a non-document response and CORP `same-origin` is correct for every
 * same-origin subresource, so applying the whole set costs nothing.
 *
 * @param options - Client root plus the Electron `protocol`/`net` modules.
 * @returns Nothing.
 */
export const registerAppProtocol = (options: RegisterAppProtocolOptions): void => {
  options.protocol.handle(appScheme, async (request) => {
    const filePath = resolveAppRequest(request.url, options.clientRoot);
    if (!filePath) {
      return new Response(undefined, { status: 404, statusText: 'Not Found' });
    }
    const response = await options.net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    applyDocumentHeaders(headers);
    if (options.contentSecurityPolicy !== undefined) {
      headers.set('content-security-policy', options.contentSecurityPolicy);
    }
    const pinned = pinnedContentTypes[extname(filePath).toLowerCase()];
    if (pinned) {
      headers.set('content-type', pinned);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
};
