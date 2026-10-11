/**
 * Decorate a `WebSocket` constructor so connections to one Zoo proxy URL carry upgrade headers.
 *
 * A proxy such as Tau's authenticates the WebSocket *upgrade*, which a browser
 * cannot decorate from script and the kernel's in-band `token` arrives too late
 * for. A Node host (undici accepts a non-standard `{ headers }` init) installs
 * the result as `globalThis.WebSocket` in the process that runs the kernel, so
 * the credential never becomes a kernel option: options feed cache keys and
 * every middleware's dependency list. `headers` is read on each connection,
 * which is what lets a host rotate or drop the credential without
 * re-initializing the kernel. Only an exact scheme, host and path match is
 * decorated, so the same process can open any other socket without lending it
 * the credential.
 *
 * @param base - The platform `WebSocket` constructor to extend.
 * @param options - The proxy URL and the current headers, or `undefined` to send none.
 * @returns A `WebSocket` subclass for the hosting process.
 * @public
 *
 * @example <caption>Authenticate the Tau Zoo proxy from a Node host</caption>
 * ```typescript
 * import { withZooProxyHeaders } from '@taucad/zoo/proxy';
 *
 * let token: string | undefined;
 * globalThis.WebSocket = withZooProxyHeaders(globalThis.WebSocket, {
 *   url: 'wss://api.tau.new/v1/kernels/zoo',
 *   headers: () => (token === undefined ? undefined : { 'tau-zoo-token': token }),
 * });
 * ```
 */
export const withZooProxyHeaders = (
  base: typeof WebSocket,
  options: { readonly url: string; readonly headers: () => Readonly<Record<string, string>> | undefined },
): typeof WebSocket => {
  const proxy = new URL(options.url);
  const decorated = class extends base {
    public constructor(url: string | URL, protocols?: string | string[]) {
      const target = new URL(url);
      const headers =
        target.protocol === proxy.protocol && target.host === proxy.host && target.pathname === proxy.pathname
          ? options.headers()
          : undefined;
      // Undici's non-standard WebSocketInit; DOM typings know only the protocols form.
      super(
        url,
        headers === undefined
          ? protocols
          : ({ ...(protocols === undefined ? {} : { protocols }), headers } as unknown as string[]),
      );
    }
  };
  return decorated;
};
