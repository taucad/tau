import * as Cookies from 'es-cookie';
import type { PostHog } from 'posthog-js';
import { vi } from 'vitest';

/*
 * The suites that drive the installed PostHog SDK through the web analytics boundary give every test its own module
 * graph, so each one owns a fresh SDK singleton bound to its own transport. The SDK keeps everything it decides in the
 * document (storage, cookies, `window.posthog`), and a fresh singleton reads that back on `init`, so the document is
 * reset between tests as well.
 */

/** The transport a test's SDK instance is bound to. */
export type SdkTransport = {
  /** Handles one `fetch`; the SDK reads `fetch` when its module is evaluated, so each instance keeps its own. */
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Records one `XMLHttpRequest.open`. */
  readonly open?: (url: string) => void;
  /** Handles one `navigator.sendBeacon`. */
  readonly sendBeacon: (url: string, body: BodyInit) => boolean;
};

/** The URL of the request a stubbed `fetch` received. */
export const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * Stub everything the SDK sends through, then evaluate a fresh module graph. Call it in `beforeEach`, and
 * {@link restoreSdkPlatform} in `afterEach`.
 *
 * @param transport - This test's transport.
 */
export const stubSdkPlatform = (transport: SdkTransport): void => {
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation((_method, url) => {
    transport.open?.(String(url));
  });
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(transport.fetch));
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
  });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(transport.sendBeacon) });
  vi.resetModules();
};

/** Where the document started, read when this module is first evaluated. */
const initialUrl = globalThis.location.href;

/**
 * Stop a test's SDK instance and return the document to a fresh tab: no stubs, no storage, no cookies, the starting
 * address and no console client.
 *
 * @param sdk - The test's SDK instance; an initialised one is opted out so it sends nothing during a later test.
 */
export const restoreSdkPlatform = (sdk: Pick<PostHog, '__loaded' | 'opt_out_capturing'> | undefined): void => {
  if (sdk?.__loaded === true) {
    sdk.opt_out_capturing();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'sendBeacon');
  Reflect.deleteProperty(globalThis, 'posthog');
  localStorage.clear();
  sessionStorage.clear();
  for (const name of Object.keys(Cookies.getAll())) {
    Cookies.remove(name, { path: '/' });
    Cookies.remove(name);
  }
  history.replaceState(null, '', initialUrl);
};
