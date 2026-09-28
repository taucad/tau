/* The services utility's runtime-port requester driven against the real main broker. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServicesBroker } from '#main/services-broker.js';
import type { ServicesBrokerOptions } from '#main/services-broker.js';
import type * as Impl from '#tau/services-host.impl.js';

type Lease = { readonly port: { close: () => void }; release(reason: 'requested' | 'render-timeout'): void };
const captured = vi.hoisted(() => ({
  requestRuntimePort: undefined as undefined | ((workspaceRoot: string) => Promise<Lease>),
}));

vi.mock('#tau/services-host.impl.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Impl>();
  return {
    refusedRuntimePortMessage: actual.refusedRuntimePortMessage,
    createServicesHost: (options: { requestRuntimePort: (workspaceRoot: string) => Promise<Lease> }) => {
      captured.requestRuntimePort = options.requestRuntimePort;
      return { handleMessage: vi.fn(), dispose: vi.fn() };
    },
  };
});

/**
 * Wire the utility entry's `parentPort` to a real broker, with main's side of
 * the utility→main direction held in a queue so a test decides when main answers.
 */
const harness = async () => {
  const toUtility: Array<(message: { data: unknown; ports: unknown[] }) => void> = [];
  const toMain: Array<(message: unknown) => void> = [];
  const heldForMain: unknown[] = [];
  const utilityPosts: unknown[] = [];
  const parentPort = {
    on: (_event: 'message', listener: (message: { data: unknown; ports: unknown[] }) => void) => {
      toUtility.push(listener);
    },
    postMessage: (message: unknown) => {
      utilityPosts.push(message);
      heldForMain.push(message);
    },
  };
  Object.defineProperty(process, 'parentPort', { value: parentPort, configurable: true });
  vi.stubEnv('TAU_DESKTOP_AUTHORITY_DIR', '/tmp/k1-authority');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const leases: Array<{ port: { close: ReturnType<typeof vi.fn> }; dispose: ReturnType<typeof vi.fn> }> = [];
  const broker = createServicesBroker({
    utilityEntry: '/dist/main/services-host.js',
    env: {},
    fork: () => ({
      on: (event: string, listener: (message: unknown) => void) => {
        if (event === 'message') {
          toMain.push(listener);
        }
      },
      postMessage: (data: unknown, ports: unknown[] = []) => {
        for (const listener of toUtility) {
          listener({ data, ports });
        }
      },
      kill: vi.fn(),
    }),
    createChannel: () => ({ port1: { close: vi.fn() }, port2: { close: vi.fn() } }),
    connectRuntime: () => {
      const lease = { port: { close: vi.fn() }, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
      leases.push(lease);
      return lease;
    },
  } as unknown as ServicesBrokerOptions);
  broker.connect('agentHost', { workspaceRoot: '/home/widget' });
  await import('#tau/services-host.js');
  /** Main processes everything the utility sent so far, in order. */
  const mainAnswers = (): void => {
    for (const message of heldForMain.splice(0)) {
      for (const listener of toMain) {
        listener(message);
      }
    }
  };
  return { broker, leases, mainAnswers, utilityPosts, request: captured.requestRuntimePort! };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  Reflect.deleteProperty(process, 'parentPort');
});

describe('services utility runtime-port request against the main broker', () => {
  it('should end once with the timeout and release the lease main mints late', async () => {
    const { leases, mainAnswers, utilityPosts, request } = await harness();
    vi.useFakeTimers();
    const pending = Promise.allSettled([request('/home/widget')]);
    await vi.advanceTimersByTimeAsync(10_000);
    const [outcome] = await pending;
    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') {
      throw new Error('Expected a rejected runtime-port request.');
    }
    expect(outcome.reason).toMatchObject({
      code: 'TIMEOUT',
      message: 'Main did not answer the desktop runtime-port request within 10 seconds.',
    });
    /* Main finally processes the request and the utility's timeout release. */
    mainAnswers();
    expect(leases).toHaveLength(1);
    expect(leases[0]!.dispose).toHaveBeenCalled();
    /* The late port frame main sent is closed by the utility and released again. */
    mainAnswers();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toHaveLength(1);
    expect(utilityPosts.filter((post) => (post as { type: string }).type === 'runtime-port-release')).toHaveLength(2);
  }, 120_000);

  it('should succeed when main answers inside the bound, and never time out afterwards', async () => {
    const { leases, mainAnswers, request } = await harness();
    vi.useFakeTimers();
    const pending = request('/home/widget');
    await vi.advanceTimersByTimeAsync(9900);
    mainAnswers();
    await expect(pending).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(leases[0]!.dispose).not.toHaveBeenCalled();
  }, 120_000);

  it('should reject with the broker reason when main refuses', async () => {
    const { broker, mainAnswers, request } = await harness();
    const quiesce = broker.quiesce(1);
    const pending = request('/home/widget');
    mainAnswers();
    await expect(pending).rejects.toThrow(
      'Main refused the desktop runtime-port request: The desktop services broker is quiescing and connects no new runtimes.',
    );
    await quiesce;
  }, 120_000);
});
