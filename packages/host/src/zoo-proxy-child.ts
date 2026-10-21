/**
 * The daemon's half of the runtime child's Zoo credential.
 *
 * The runtime child runs project code under a minimal environment, so it never
 * gets `TAU_AUTH_TOKEN`. The daemon, which holds it, trades it for a Zoo-scoped
 * token and sends only that, to every live child, and the latest one to each
 * child it starts later (`docs/research/zoo-kernel-local-hosts-blueprint.md`).
 */

import { createZooProxyTokenSource } from '@taucad/zoo/proxy';
import type { ZooProxyCredentialFrame } from '@taucad/zoo/proxy';

/** Where the child's Zoo kernel connects, and the session that may mint its token. @public */
export type HostZooProxyOptions = {
  /** The proxy URL the child's kernel names, `<websocket origin>/v1/kernels/zoo`. */
  readonly url: string;
  /** The Tau API that mints Zoo-scoped tokens. */
  readonly apiUrl: string;
  /** `TAU_AUTH_TOKEN`; absent, the child's Zoo kernel reports that sign-in is needed. */
  readonly sessionToken?: string | undefined;
};

/** Whatever receives the frames: the supervised runtime child. */
type CredentialReceiver = { post(message: ZooProxyCredentialFrame): void };

/** The daemon's handle on the child credential. */
type ZooProxyChildCredential = {
  /** Add `child` to the receivers and replay the latest frame to it; returns its detach. */
  attach(child: CredentialReceiver): () => void;
  /** Mint the first token and begin refreshing. */
  start(): Promise<void>;
  /** Stop refreshing. */
  dispose(): void;
};

/**
 * Keep the runtime child's Zoo-scoped token current.
 *
 * @param options - The proxy, injected `fetch` and a warning sink that never receives a credential.
 * @returns `attach` for each child, `start` once, and `dispose` at shutdown.
 */
export const createZooProxyChildCredential = (options: {
  readonly zooProxy: HostZooProxyOptions;
  readonly fetch?: typeof globalThis.fetch;
  readonly onWarning: (message: string) => void;
}): ZooProxyChildCredential => {
  let latest: ZooProxyCredentialFrame | undefined;
  const receivers = new Set<CredentialReceiver>();
  const { sessionToken } = options.zooProxy;
  const source = createZooProxyTokenSource({
    apiUrl: options.zooProxy.apiUrl.replace(/\/+$/u, ''),
    proxyUrl: options.zooProxy.url,
    sessionToken: () => (sessionToken === '' ? undefined : sessionToken),
    publish: (frame) => {
      latest = frame;
      for (const receiver of receivers) {
        receiver.post(frame);
      }
    },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    log: (level, event, detail) => {
      if (level === 'warn') {
        options.onWarning(`${event}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
      }
    },
  });
  return {
    attach(child: CredentialReceiver): () => void {
      receivers.add(child);
      if (latest !== undefined) {
        child.post(latest);
      }
      return () => {
        receivers.delete(child);
      };
    },
    async start(): Promise<void> {
      await source.update();
    },
    dispose(): void {
      source.dispose();
    },
  };
};
