import type { RuntimeAgentClient } from '@taucad/agent-tools/runtime';
import type { WorkbenchRuntime } from '@taucad/agent-tools/registry';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

/** The runtime surface an agent host reads, over a runtime that exists only while it is used. */
export type IdleRuntimeClient = RuntimeAgentClient &
  WorkbenchRuntime & {
    readonly capabilities: AppRuntimeClient['capabilities'];
    /** Terminate the live runtime, if any, and refuse every later use. */
    terminate(): void;
    /**
     * Start the runtime and connect it ahead of a likely use: a composer took focus, or a turn is being admitted (WP-12
     * step 7). Its idle window starts again once the connect settles. Best effort: a failed connect is the next use's to
     * report.
     */
    warm(): void;
    /**
     * Say whether a chat view of this host is visible. While it is, a started runtime is kept; it idles out only once
     * no view is visible (WP-12 step 7, HP-15). Nothing is started by a view alone.
     */
    setVisible(visible: boolean): void;
  };

/**
 * A runtime client that starts its worker on first use and terminates it after
 * `idleTimeout` milliseconds with no call or open document.
 *
 * While a chat view is visible a started runtime stays, so the gaps between turns of a chat in front of the person
 * pay no restart; it idles out once no view is visible.
 *
 * Every runtime worker holds its own kernels, esbuild and WASM heaps, which
 * never shrink. A host that uses the runtime in bursts, such as an agent turn,
 * would otherwise keep a second full copy of the editor's runtime for the
 * life of the project. Each document holds the runtime until it is closed, so
 * only request-scoped documents belong here; a stateful session such as a
 * machine connection needs a resident client.
 *
 * @param options - The runtime factory and the idle window in milliseconds.
 * @returns The idle-terminating client.
 */
export const createIdleRuntimeClient = (options: {
  readonly create: () => AppRuntimeClient;
  readonly idleTimeout: number;
  /** Whether a chat view is visible when the client is made. Default: not. */
  readonly visible?: boolean;
}): IdleRuntimeClient => {
  let current: AppRuntimeClient | undefined;
  let leases = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let terminated = false;
  let visible = options.visible ?? false;

  const release = (): void => {
    current?.terminate();
    current = undefined;
  };
  const acquire = (): AppRuntimeClient => {
    if (terminated) {
      throw new Error('The runtime client is terminated.');
    }
    clearTimeout(idleTimer);
    idleTimer = undefined;
    leases += 1;
    // A runtime whose worker died is replaced rather than failing every later call.
    if (current?.lifecycleState === 'terminated') {
      current = undefined;
    }
    current ??= options.create();
    return current;
  };
  const idle = (): void => {
    clearTimeout(idleTimer);
    idleTimer = leases === 0 && !terminated && !visible ? setTimeout(release, options.idleTimeout) : undefined;
  };
  const settle = (): void => {
    leases -= 1;
    idle();
  };
  const leased = async <T>(use: (client: AppRuntimeClient) => Promise<T>): Promise<T> => {
    const client = acquire();
    try {
      return await use(client);
    } finally {
      settle();
    }
  };

  return {
    get capabilities() {
      return current?.capabilities;
    },
    connect: async () => leased(async (client) => client.connect()),
    describe: async (input) => leased(async (client) => client.describe(input)),
    open: (input) => {
      const client = acquire();
      let document: ReturnType<AppRuntimeClient['open']>;
      try {
        document = client.open(input);
      } catch (error) {
        settle();
        throw error;
      }
      let open = true;
      return {
        ...document,
        close: () => {
          document.close();
          if (open) {
            open = false;
            settle();
          }
        },
      };
    },
    warm: () => {
      if (terminated) {
        return;
      }
      // async-iife: bootstrap -- a warm-up has no caller to answer; the next use reports a runtime that failed.
      void (async (): Promise<void> => {
        try {
          await leased(async (client) => client.connect());
        } catch {
          /* The next use starts or reports the runtime. */
        }
      })();
    },
    setVisible: (next) => {
      visible = next;
      idle();
    },
    terminate: () => {
      terminated = true;
      clearTimeout(idleTimer);
      idleTimer = undefined;
      release();
    },
  };
};
