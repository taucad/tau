/**
 * Whether the page reads offline: the browser reports no network (`navigator.onLine` is `false`), so a request to
 * another origin could only fail. A page that reads online may still be cut off; only a request finds that out.
 *
 * @returns `true` while the browser reports no network; `false` without a navigator (a server render).
 * @public
 */
export const pageReadsOffline = (): boolean => (globalThis.navigator as Navigator | undefined)?.onLine === false;

/**
 * The failure a request refused for reading offline rejects with: a `TypeError`, as `fetch` rejects when the network
 * is down, so every caller treats it as the network failure it stands for.
 *
 * @returns The error to throw instead of sending the request.
 * @public
 */
export const offlineRequestError = (): TypeError =>
  new TypeError('Failed to fetch: the page reads offline, so no request was sent.');
