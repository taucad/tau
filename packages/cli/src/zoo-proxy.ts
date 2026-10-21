/**
 * Where the CLI's Zoo kernel connects, and how it authenticates there.
 *
 * Tau's Zoo proxy authenticates the WebSocket upgrade, which the kernel cannot
 * decorate itself, and a credential in kernel options would feed cache keys and
 * every middleware's dependencies. So the CLI decorates its own process's
 * `WebSocket` for the one proxy URL instead.
 */

import { authApiOrigin, resolveAuthToken } from '#auth.js';
import { withZooProxyHeaders } from '@taucad/zoo/proxy';

/** The Tau Cloud API, which `tau serve` relays to by default too. */
const defaultApiUrl = 'https://api.tau.new';

type ZooProxyEnvironment = Readonly<Record<string, string | undefined>>;

/* eslint-disable @typescript-eslint/naming-convention -- WebSocket close-code keys are numeric protocol values. */
/**
 * What a Zoo proxy refusal says on a terminal. Codes match the API's
 * `zooCloseCodes`; no billing copy, which belongs to the web app.
 */
export const cliZooCloseErrors: Readonly<Record<string, string>> = {
  1013: 'Zoo execution is unavailable on this Tau API right now. Your project is safe; try again later.',
  4401: 'Run tau auth login or set TAU_AUTH_TOKEN to use the Zoo kernel.',
  4403: 'Zoo execution requires Pro on this Tau account.',
};
/* eslint-enable @typescript-eslint/naming-convention -- End numeric WebSocket close-code keys. */

/**
 * The Zoo proxy URL: `TAU_WEBSOCKET_URL`, else the WebSocket form of `TAU_API_URL`, else Tau Cloud.
 *
 * A development API serves WebSockets on its port plus one, so set
 * `TAU_WEBSOCKET_URL` there rather than relying on the derivation.
 *
 * @param environment - Usually `process.env`.
 * @returns `<websocket origin>/v1/kernels/zoo`.
 */
export const cliZooProxyUrl = (environment: ZooProxyEnvironment): string => {
  const set = (value: string | undefined): string | undefined => (value === '' ? undefined : value);
  const base =
    set(environment['TAU_WEBSOCKET_URL']) ?? (set(environment['TAU_API_URL']) ?? defaultApiUrl).replace(/^http/u, 'ws');
  return `${base.replace(/\/+$/u, '')}/v1/kernels/zoo`;
};

/**
 * Saved account sessions may authenticate only the matching API WebSocket origin.
 * @param apiUrl - Selected API origin.
 * @param socketUrl - Destination WebSocket URL.
 * @param environment - Optional explicit credential override.
 * @returns The eligible session bearer, if available.
 */
export const resolveZooAuthToken = async (
  apiUrl: string,
  socketUrl: string,
  environment: ZooProxyEnvironment = process.env,
): Promise<string | undefined> => {
  const apiOrigin = authApiOrigin(apiUrl);
  const socket = new URL(socketUrl);
  const expected = apiOrigin.replace(/^http/u, 'ws');
  if (!environment['TAU_AUTH_TOKEN'] && socket.origin !== expected) {
    return undefined;
  }
  return resolveAuthToken(apiOrigin, environment);
};

/**
 * Put `TAU_AUTH_TOKEN` on this process's Zoo proxy upgrades.
 *
 * For the in-process commands (`tau export`, `tau view`): the variable is
 * already in this process's environment, which project code shares, so this
 * lends it nothing new. `tau serve` children never get it; their parent sends
 * them a Zoo-scoped token instead.
 *
 * @param environment - Usually `process.env`.
 */
export const authorizeCliZooProxy = async (environment: ZooProxyEnvironment): Promise<void> => {
  const token = await resolveZooAuthToken(
    authApiOrigin(environment['TAU_API_URL']),
    cliZooProxyUrl(environment),
    environment,
  );
  if (token === undefined || token === '') {
    return;
  }
  globalThis.WebSocket = withZooProxyHeaders(globalThis.WebSocket, {
    url: cliZooProxyUrl(environment),
    headers: () => ({ authorization: `Bearer ${token}` }),
  });
};
