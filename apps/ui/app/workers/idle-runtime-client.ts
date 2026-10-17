import type { RuntimeAgentClient } from '@taucad/agent-tools/runtime';
import type { WorkbenchRuntime } from '@taucad/agent-tools/registry';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

/** The runtime surface an agent host reads, over a runtime that exists only while it is used. */
export type IdleRuntimeClient = RuntimeAgentClient &
  WorkbenchRuntime & {
    readonly capabilities: AppRuntimeClient['capabilities'];
    /** Terminate the live runtime, if any, and refuse every later use. */
    terminate(): void;
  };

/**
 * A runtime client that starts its worker on first use and terminates it after
 * `idleTimeout` milliseconds with no call or open document.
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
}): IdleRuntimeClient => {
  let current: AppRuntimeClient | undefined;
  let leases = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let terminated = false;

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
  const settle = (): void => {
    leases -= 1;
    if (leases === 0 && !terminated) {
      idleTimer = setTimeout(release, options.idleTimeout);
    }
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
    terminate: () => {
      terminated = true;
      clearTimeout(idleTimer);
      idleTimer = undefined;
      release();
    },
  };
};
