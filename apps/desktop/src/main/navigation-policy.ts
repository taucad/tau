/**
 * What the renderer is allowed to become, and who is allowed to talk to main.
 *
 * The preload runs on **every** document the window loads, so a single
 * in-window navigation to a foreign origin would hand that origin
 * `requestServicesPort()` — a `MessagePort` onto the node filesystem host over
 * every granted root — plus `tauAuth` and the kernel bridge, while main's own
 * header injection keeps attaching the bearer to API-origin requests. Pinning
 * the renderer to one origin is therefore not hardening, it is the boundary the
 * rest of the shell's trust model assumes.
 *
 * Everything here is a pure decision so it can be tested without an Electron
 * window; `main.ts` only wires the results to Electron's events.
 */

/**
 * The origin of a URL, computed as `scheme://host`.
 *
 * Not `URL.origin`: `app:` is not one of the WHATWG parser's *special* schemes,
 * so Node answers the string `'null'` for every `app://` URL — Chromium knows
 * better only because `registerSchemesAsPrivileged` marked it `standard`. A
 * guard built on `.origin` would therefore refuse every in-app navigation.
 * `protocol` + `host` is well-defined for special and non-special schemes
 * alike, and agrees with `.origin` for `http(s)` including default ports.
 *
 * @param url - Absolute URL.
 * @returns The origin, or `undefined` when the URL will not parse.
 */
const originOf = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    return parsed.host === '' ? undefined : `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
};

/** Schemes that go to the user's browser instead of into the app. */
const externalSchemes: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

/**
 * Origins the renderer may occupy.
 *
 * Production is exactly one: `app://tau`. Development adds the
 * `ui:dev:desktop` server, which is where `ELECTRON_RENDERER_URL` points and
 * where `app://` is not registered at all.
 *
 * @param input - The `app://` origin and the dev-server URL when running one.
 * @returns The allowed origins.
 */
export const rendererOrigins = (input: {
  readonly appOrigin: string;
  readonly devServerUrl?: string | undefined;
}): readonly string[] => {
  const development = input.devServerUrl === undefined ? undefined : originOf(input.devServerUrl);
  return development === undefined ? [input.appOrigin] : [input.appOrigin, development];
};

/**
 * Whether a URL may be loaded *into* the renderer.
 *
 * @param url - Candidate navigation target.
 * @param origins - Result of {@link rendererOrigins}.
 * @returns True when the navigation stays inside the app.
 */
export const isRendererUrl = (url: string, origins: readonly string[]): boolean => {
  const origin = originOf(url);
  return origin !== undefined && origins.includes(origin);
};

/** What to do with a navigation or window-open request. */
export type NavigationDecision = 'allow' | 'open-externally' | 'deny';

/**
 * Decide one navigation or `window.open`.
 *
 * In-app URLs proceed; `http(s)`/`mailto` go to the user's browser, which is
 * what a link in a CAD document or a docs link should do; everything else —
 * `file:`, `javascript:`, another custom scheme — is refused outright rather
 * than handed to the OS.
 *
 * @param url - Candidate target.
 * @param origins - Result of {@link rendererOrigins}.
 * @returns The decision.
 */
export const navigationDecision = (url: string, origins: readonly string[]): NavigationDecision => {
  if (isRendererUrl(url, origins)) {
    return 'allow';
  }
  try {
    return externalSchemes.has(new URL(url).protocol) ? 'open-externally' : 'deny';
  } catch {
    return 'deny';
  }
};

/**
 * The subset of `WebFrameMain` the sender check reads.
 *
 * `parent` is `unknown` because only its presence matters: Electron reports a
 * top-level frame's parent as absent and a nested one's as another frame.
 */
export type SenderFrame = { readonly url: string; readonly parent?: unknown };

/**
 * Whether an IPC message came from the app's own top-level document.
 *
 * Both halves matter: the origin test refuses a frame that navigated away, and
 * the main-frame test refuses a nested `<iframe>` — which under
 * `contextIsolation` still holds the preload bridge.
 *
 * @param frame - `event.senderFrame`, which Electron may report as absent.
 * @param origins - Result of {@link rendererOrigins}.
 * @returns True when the sender may be served.
 */
export const isTrustedSender = (frame: SenderFrame | undefined, origins: readonly string[]): boolean =>
  frame !== undefined && !frame.parent && isRendererUrl(frame.url, origins);

/**
 * Content-Security-Policy for every `app://` response.
 *
 * `'unsafe-inline'` in `script-src` is not a shortcut — it is measured. The
 * built SPA's `index.html` carries five inline scripts that React Router owns
 * (`window.__reactRouterContext`, the route-module import map, and the two
 * hydration-stream calls) plus the theme and `window.ENV` bootstraps. Without
 * it the app does not boot at all. The directive still does the job that
 * matters here: no *remote* script origin is reachable, so a compromised
 * renderer cannot pull code in.
 *
 * `'wasm-unsafe-eval'` is required by every WebAssembly kernel; `blob:` in
 * `worker-src`/`connect-src` by the runtime's worker delivery and Monaco.
 * `default-src 'none'` makes every directive below an explicit grant, and
 * `base-uri`/`form-action`/`frame-ancestors 'none'` close the three
 * redirect-style escapes a CSP is usually forgotten on.
 *
 * @param connectOrigins - API and WebSocket origins the renderer must reach.
 * @returns The header value.
 */
export const contentSecurityPolicy = (connectOrigins: readonly string[]): string =>
  [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self' data: blob:${connectOrigins.map((origin) => ` ${origin}`).join('')}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

/**
 * Permissions the app is allowed to hold.
 *
 * Deny-by-default, with one grant. `persistent-storage` covers exactly two
 * stores, and neither is project data: the bundled-types cache the file-manager
 * worker mounts at `/node_modules` on OPFS
 * (`apps/ui/app/machines/file-manager.worker.ts`), and IndexedDB `tau-db`
 * (workspace records, chat state). The FM's file pool is *not* covered — it is
 * a RAM `SharedArrayBuffer`, not OPFS. Refusing the grant leaves those two
 * stores *evictable*, which on a native app means a silent re-download and a
 * forgotten picked folder rather than the browser's "this is just a tab"
 * reasoning. The grant stays until wave S4 of
 * `docs/research/host-agnostic-transport-substrate-blueprint.md` relocates the
 * types cache out of OPFS. Everything else (camera, microphone, geolocation,
 * notifications, clipboard read, background sync, …) is refused: nothing in the
 * app asks for one, so a request is either a dependency doing something
 * unexpected or a document that should not have loaded.
 */
export const grantedPermissions: ReadonlySet<string> = new Set(['persistent-storage']);

/**
 * Whether one permission request or check may be granted.
 *
 * @param permission - Electron's permission name.
 * @returns True only for {@link grantedPermissions}.
 */
export const isPermissionGranted = (permission: string): boolean => grantedPermissions.has(permission);
