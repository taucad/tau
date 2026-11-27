/**
 * Bearer + client-compat header injection (work items A4 and E12/batch U).
 *
 * Every renderer→API request is decorated in main, not in the renderer: the
 * token never crosses into a web page, and WebSocket upgrades — which browsers
 * cannot decorate from script — get the same treatment as `fetch`. Injection
 * is scoped to the API's own origins; a request to any other origin leaves
 * main carrying exactly what the renderer sent.
 */

/** Options for {@link injectTauHeaders} and {@link installTauHeaderInjection}. */
export type TauHeaderInjectionOptions = {
  /**
   * Origins that receive the credential. `TAU_API_URL`'s origin, plus
   * `TAU_WEBSOCKET_URL`'s when it differs: a `ws://` upgrade has its own
   * origin string, so an API origin alone would leave the chat RPC socket and
   * the agent sockets unauthenticated.
   */
  readonly allowedOrigins: readonly string[];
  /** Current bearer token, or `undefined` while signed out. */
  readonly token: () => string | undefined;
  /** `tau-client` value, e.g. `tau-desktop/0.0.1`. */
  readonly clientHeader: string;
  /**
   * Settles once the stored credential has been read. The window no longer waits for it (B32), so a request to an
   * allowed origin made before then waits instead, at most {@link credentialWaitMilliseconds}, and then carries
   * whatever token there is. Omitted, nothing waits.
   */
  readonly ready?: Promise<unknown>;
  /** Told the bearer a request to an allowed origin carried when the answer was 401. */
  readonly onUnauthorized?: (token: string) => void;
};

/**
 * Normalize one configured URL to the origin form `webRequest` reports.
 *
 * @param url - An absolute `http`, `https`, `ws`, or `wss` URL.
 * @returns The origin, or `undefined` when the URL is unusable.
 */
export const originOf = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** Names main owns outright on an allowed origin, in lowercase. */
const managedRequestHeaders: ReadonlySet<string> = new Set(['authorization', 'tau-client']);

/**
 * Decide the outgoing header set for one request.
 *
 * @param url - Request URL as Electron reports it.
 * @param requestHeaders - Headers the renderer produced.
 * @param options - Allowed origins, token source, and client header.
 * @returns The headers to send. Returned unchanged for a foreign origin.
 */
export const injectTauHeaders = (
  url: string,
  requestHeaders: Record<string, string>,
  options: TauHeaderInjectionOptions,
): Record<string, string> => {
  const origin = originOf(url);
  if (origin === undefined || !options.allowedOrigins.includes(origin)) {
    return requestHeaders;
  }
  /* Drop any existing spelling first. Header names are case-insensitive, so a
   * renderer-supplied `Authorization` would otherwise survive alongside main's
   * lowercase `authorization` and the server would see two — with the one main
   * did not choose potentially winning. */
  const headers = Object.fromEntries(
    Object.entries(requestHeaders).filter(([name]) => !managedRequestHeaders.has(name.toLowerCase())),
  );
  const token = options.token();
  headers['tau-client'] = options.clientHeader;
  if (token !== undefined) {
    headers['authorization'] = `Bearer ${token}`;
  }
  return headers;
};

/** The `session.webRequest` surface this module uses. */
type WebRequestLike = {
  onBeforeSendHeaders(
    filter: { urls: string[] },
    listener: (
      details: { id?: number; url: string; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void,
  ): void;
  onCompleted?(filter: { urls: string[] }, listener: (details: { id: number; statusCode: number }) => void): void;
  onErrorOccurred?(filter: { urls: string[] }, listener: (details: { id: number }) => void): void;
};

/** The longest an authenticated request waits for the stored credential to be read: a keychain prompt can take minutes. */
export const credentialWaitMilliseconds = 10_000;

/**
 * Install the injection listener on one session.
 *
 * @param webRequest - `session.webRequest` of the renderer's session.
 * @param options - Allowed origins, token source, and client header.
 * @returns Nothing.
 */
export const installTauHeaderInjection = (webRequest: WebRequestLike, options: TauHeaderInjectionOptions): void => {
  const { ready } = options;
  let credentialRead = ready === undefined;
  const waitForCredential = (async (): Promise<void> => {
    try {
      await ready;
    } catch {
      /* A credential that could not be read leaves the session signed out; requests go without one. */
    }
    credentialRead = true;
  })();
  /* `<all_urls>` with an in-listener origin test, never a URL-pattern filter:
   * pattern filters do not match custom standard schemes, and the exactness of
   * the decision matters more than the small cost of seeing every request. */
  /* The bearer each in-flight authenticated request carried, so a 401 names the token it refused, not a newer one. */
  const sent = new Map<number, string>();
  const send = (
    details: { id?: number; url: string; requestHeaders: Record<string, string> },
    callback: (response: { requestHeaders: Record<string, string> }) => void,
  ): void => {
    const requestHeaders = injectTauHeaders(details.url, details.requestHeaders, options);
    const bearer = requestHeaders['authorization'];
    if (options.onUnauthorized !== undefined && details.id !== undefined && bearer?.startsWith('Bearer ') === true) {
      sent.set(details.id, bearer.slice('Bearer '.length));
    }
    callback({ requestHeaders });
  };
  if (options.onUnauthorized !== undefined) {
    const { onUnauthorized } = options;
    webRequest.onCompleted?.({ urls: ['<all_urls>'] }, (details) => {
      const token = sent.get(details.id);
      sent.delete(details.id);
      if (token !== undefined && details.statusCode === 401) {
        onUnauthorized(token);
      }
    });
    webRequest.onErrorOccurred?.({ urls: ['<all_urls>'] }, (details) => {
      sent.delete(details.id);
    });
  }
  webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const origin = originOf(details.url);
    if (credentialRead || origin === undefined || !options.allowedOrigins.includes(origin)) {
      send(details, callback);
      return;
    }
    /* Only a request that would carry the credential waits for it; everything else goes at once. */
    // async-iife: bootstrap -- webRequest listeners answer through their callback, not a promise.
    void (async (): Promise<void> => {
      let bound: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        waitForCredential,
        new Promise<void>((resolve) => {
          bound = setTimeout(resolve, credentialWaitMilliseconds);
        }),
      ]);
      clearTimeout(bound);
      send(details, callback);
    })();
  });
};
