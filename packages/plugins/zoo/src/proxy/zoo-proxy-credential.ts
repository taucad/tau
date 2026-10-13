/**
 * The Zoo-scoped token inside a process that runs a Zoo kernel and project code.
 *
 * Tau's Zoo proxy authenticates the WebSocket upgrade. A host's kernel process
 * runs project JavaScript in the kernel's own realm, so it must never hold the
 * user's session. The trusted process that does hold it mints a Zoo-scoped token
 * (it opens the proxy as this user for half an hour and nothing else) and sends
 * it here as a {@link ZooProxyCredentialFrame}. This module keeps only the latest
 * one, in a closure, and puts it on upgrades to the one proxy URL the frame names.
 */

import { withZooProxyHeaders } from '#proxy/zoo-proxy-headers.js';

/** Upgrade header carrying a Zoo-scoped token. @public */
export const zooProxyTokenHeader = 'tau-zoo-token';

/** Frame `type` a credential publisher sends and {@link installZooProxyCredential} consumes. @public */
export const zooProxyCredentialFrameType = 'zoo-proxy-credential';

/** The latest proxy credential; no `token` while signed out. @public */
export type ZooProxyCredentialFrame = {
  readonly type: typeof zooProxyCredentialFrameType;
  /** The Zoo proxy URL the kernel's `baseUrl` names, e.g. `${TAU_WEBSOCKET_URL}/v1/kernels/zoo`. */
  readonly url: string;
  readonly token?: string;
};

const readFrame = (data: unknown): ZooProxyCredentialFrame | undefined => {
  if (typeof data !== 'object' || data === null || Reflect.get(data, 'type') !== zooProxyCredentialFrameType) {
    return undefined;
  }
  const url: unknown = Reflect.get(data, 'url');
  const token: unknown = Reflect.get(data, 'token');
  if (typeof url !== 'string' || !URL.canParse(url) || (token !== undefined && typeof token !== 'string')) {
    return undefined;
  }
  return { type: zooProxyCredentialFrameType, url, ...(token === undefined ? {} : { token }) };
};

/**
 * Decorate this process's `WebSocket` from the credential frames a trusted parent sends.
 *
 * @param subscribe - Registers a listener for every message from the parent; other messages pass by untouched.
 * @public
 *
 * @example <caption>A Node child process</caption>
 * ```typescript
 * import { installZooProxyCredential } from '@taucad/zoo/proxy';
 *
 * installZooProxyCredential((listener) => {
 *   process.on('message', (data) => {
 *     listener(data);
 *   });
 * });
 * ```
 */
export const installZooProxyCredential = (subscribe: (listener: (data: unknown) => void) => void): void => {
  const platformWebSocket = globalThis.WebSocket;
  let token: string | undefined;
  let url: string | undefined;
  subscribe((data) => {
    const frame = readFrame(data);
    if (frame === undefined) {
      return;
    }
    token = frame.token;
    if (frame.url !== url) {
      url = frame.url;
      globalThis.WebSocket = withZooProxyHeaders(platformWebSocket, {
        url,
        headers: () => (token === undefined ? undefined : { [zooProxyTokenHeader]: token }),
      });
    }
  });
};
