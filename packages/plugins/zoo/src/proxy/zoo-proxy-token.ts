/**
 * The publisher's half of the Zoo-scoped token ({@link installZooProxyCredential} is the kernel process's).
 *
 * The trusted process holds the session; kernel processes run project code and
 * must not. So it trades the session for a Zoo-scoped token at Tau's
 * `POST /v1/kernels/zoo/tokens` and publishes only that, again on every
 * sign-in, sign-out and session change, and on an interval inside the token's
 * half-hour life. Nothing here persists or logs a credential.
 */

import { zooProxyCredentialFrameType } from '#proxy/zoo-proxy-credential.js';
import type { ZooProxyCredentialFrame, installZooProxyCredential } from '#proxy/zoo-proxy-credential.js';

/** Milliseconds: a third of the token's life, so two failed refreshes still leave a valid token. */
const defaultRefreshInterval = 10 * 60 * 1000;

/** Options for {@link createZooProxyTokenSource}. @public */
export type ZooProxyTokenSourceOptions = {
  /** `TAU_API_URL`, without a trailing slash. */
  readonly apiUrl: string;
  /** `${TAU_WEBSOCKET_URL}/v1/kernels/zoo`. */
  readonly proxyUrl: string;
  /** The current session token, or `undefined` while signed out. */
  readonly sessionToken: () => string | undefined;
  /** Hand the frame to every kernel process, including ones started later (keep the latest). */
  readonly publish: (frame: ZooProxyCredentialFrame) => void;
  /** Injected for tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Diagnostics sink; never receives a credential. */
  readonly log?: (level: 'info' | 'warn', event: string, detail?: unknown) => void;
  /** Milliseconds; injected for tests. */
  readonly refreshInterval?: number;
};

/** The running source. @public */
export type ZooProxyTokenSource = {
  /** Re-read the session and publish what follows from it; a no-op when the session did not change. */
  update(): Promise<void>;
  /** Stop refreshing. */
  dispose(): void;
};

/**
 * Keep every kernel utility's Zoo-scoped token in step with the session.
 *
 * @param options - API and proxy URLs, the session reader, the publisher and injected seams.
 * @returns The source; call `update` at startup and on every auth change.
 * @public
 */
export const createZooProxyTokenSource = (options: ZooProxyTokenSourceOptions): ZooProxyTokenSource => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const log = options.log ?? ((): void => undefined);
  let mintedFor: string | undefined;
  let published: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let started = false;

  const publish = (token: string | undefined): void => {
    published = token;
    options.publish({
      type: zooProxyCredentialFrameType,
      url: options.proxyUrl,
      ...(token === undefined ? {} : { token }),
    });
  };

  const stopTimer = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const mint = async (session: string): Promise<void> => {
    let response: Response;
    try {
      response = await doFetch(`${options.apiUrl}/v1/kernels/zoo/tokens`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session}` },
      });
    } catch (error) {
      log('warn', 'zoo-token.mint-failed', { message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (options.sessionToken() !== session) {
      return;
    }
    if (response.status === 401) {
      log('info', 'zoo-token.session-rejected');
      publish(undefined);
      return;
    }
    if (!response.ok) {
      log('warn', 'zoo-token.mint-failed', { status: response.status });
      return;
    }
    const body: unknown = await response.json();
    const token: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'token') : undefined;
    if (typeof token !== 'string') {
      log('warn', 'zoo-token.mint-failed', { status: response.status, reason: 'no token in response' });
      return;
    }
    log('info', 'zoo-token.minted');
    publish(token);
  };

  return {
    async update() {
      const session = options.sessionToken();
      if (started && session === mintedFor) {
        return;
      }
      started = true;
      mintedFor = session;
      stopTimer();
      if (session === undefined) {
        publish(undefined);
        return;
      }
      if (published !== undefined) {
        /* A different session: the old token names its user, not this one's. */
        publish(undefined);
      }
      timer = setInterval(() => {
        // async-iife: bootstrap -- an interval cannot await; `mint` already reports its own failures.
        void (async () => {
          const current = options.sessionToken();
          if (current !== undefined && current === mintedFor) {
            await mint(current);
          }
        })();
      }, options.refreshInterval ?? defaultRefreshInterval);
      timer.unref();
      await mint(session);
    },
    dispose() {
      stopTimer();
    },
  };
};
