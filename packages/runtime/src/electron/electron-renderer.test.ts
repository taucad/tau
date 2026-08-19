// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createElectronClientOptions,
  electronUtilityTransport,
  getElectronRuntimeBridge,
  requestElectronRuntimePort,
} from '#electron/renderer.js';

const runtimeRelayTag = 'tau-runtime-port';
const hostExitRelayTag = 'tau-runtime-host-exit';

/**
 * Synthesise the relay message preload posts into the page: same window, same
 * origin. The renderer guard rejects anything else.
 *
 * @param data - Relay payload.
 * @param ports - Transferred ports, if any.
 * @returns A message event shaped like the real relay.
 */
const relayEvent = (data: unknown, ports: MessagePort[] = []): MessageEvent =>
  ({ data, ports, origin: location.origin, source: globalThis }) as unknown as MessageEvent;

/**
 * Renderer harness that captures every listener the helper registers on the
 * injected target. A `vi.fn` target (never `globalThis`) is what lets the
 * ordering test observe listener removal; `removeEventListener` really removes,
 * so a listener that outlives its release is observable as a late delivery.
 *
 * @param hostId - Host lease the preload relay reports with the port.
 * @returns Bridge, target, a dispatcher, and the captured handler lists.
 */
const setupRendererHarness = (hostId: string) => {
  const port = new MessageChannel().port1;
  const handlers = new Map<string, Array<(event?: unknown) => void>>();
  const dispatch = (name: string, event?: unknown): void => {
    /* Every removal replaces the array rather than splicing it, so iterating
     * the snapshot this read returns is safe even when a handler unsubscribes. */
    for (const handler of handlers.get(name) ?? []) {
      handler(event);
    }
  };
  const target = {
    addEventListener: vi.fn((name: string, handler: (event?: unknown) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    }),
    removeEventListener: vi.fn((name: string, handler: (event?: unknown) => void) => {
      handlers.set(
        name,
        (handlers.get(name) ?? []).filter((entry) => entry !== handler),
      );
    }),
  } as unknown as Window;
  const bridge = {
    requestRuntimePort: vi.fn(() => {
      dispatch('message', relayEvent({ taucadRelay: runtimeRelayTag, hostId }, [port]));
    }),
    releaseRuntimeHost: vi.fn(),
    relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
  };
  return { bridge, dispatch, handlers, target };
};

describe('Electron renderer runtime helpers', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis as unknown as Record<string, unknown>, 'taucad');
  });

  it('fails loudly when the preload bridge is unavailable', () => {
    expect(() => getElectronRuntimeBridge()).toThrow(/window\.taucad bridge is unavailable/);
  });

  it('requests a runtime port after subscribing to the preload relay', async () => {
    const port = new MessageChannel().port1;
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const requestRuntimePort = vi.fn(() => {
      listener?.(relayEvent({ taucadRelay: 'taucad:connect-runtime:port', hostId: 'host-1' }, [port]));
    });
    const bridge = {
      requestRuntimePort,
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: 'taucad:connect-runtime:host-exit', runtime: 'taucad:connect-runtime:port' },
    };

    const received = await requestElectronRuntimePort({ bridge, target });

    expect(received).toBe(port);
    expect(requestRuntimePort).toHaveBeenCalledTimes(1);
    expect(target.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('creates an async client-options provider backed by electronUtilityTransport', async () => {
    const port = new MessageChannel().port1;
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const requestRuntimePort = vi.fn(() => {
      listener?.(relayEvent({ taucadRelay: runtimeRelayTag, hostId: 'host-2' }, [port]));
    });
    const bridge = {
      requestRuntimePort,
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    const provider = createElectronClientOptions({ bridge, target, renderTimeout: 1234 });
    const options = await provider();

    expect(requestRuntimePort).toHaveBeenCalledOnce();
    expect(options.renderTimeout).toBe(1234);
    expect(options.transport.id).toBe('electron-utility');
    expect(options.transport.describe()).toMatchObject({
      fileSystem: 'host-local',
      memory: {
        abortSignal: 'wire-notify',
        geometryDelivery: 'copy',
      },
      wire: 'electron-utility',
    });

    const transport = options.transport.materialize();
    if (transport.renderTimeoutRecovery.kind !== 'terminable') {
      throw new Error('Expected terminable Electron transport');
    }
    await transport.renderTimeoutRecovery.terminate();
    expect(bridge.releaseRuntimeHost).toHaveBeenCalledExactlyOnceWith('host-2', 'render-timeout');
  });

  it('releases the utility lease when the renderer page is hidden', async () => {
    const { bridge, target, dispatch } = setupRendererHarness('host-hidden');

    const received = await requestElectronRuntimePort({ bridge, target });
    /* The production sequence: the client takes the lease at materialize time,
     * so a listener that re-takes it would release nothing. */
    const client = electronUtilityTransport({ port: received }).materialize();

    dispatch('pagehide');

    expect(bridge.releaseRuntimeHost).toHaveBeenCalledExactlyOnceWith('host-hidden', 'requested');
    await client.close();
    expect(bridge.releaseRuntimeHost).toHaveBeenCalledExactlyOnceWith('host-hidden', 'requested');
  });

  it('releases exactly once regardless of order', async () => {
    const releaseOnce = async (order: 'pagehide-first' | 'close-first'): Promise<void> => {
      const { bridge, target, dispatch } = setupRendererHarness(order);
      const received = await requestElectronRuntimePort({ bridge, target });
      const client = electronUtilityTransport({ port: received }).materialize();

      if (order === 'pagehide-first') {
        dispatch('pagehide');
        await client.close();
      } else {
        await client.close();
        dispatch('pagehide');
      }

      expect(bridge.releaseRuntimeHost).toHaveBeenCalledExactlyOnceWith(order, 'requested');
      expect(target.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    };

    await releaseOnce('pagehide-first');
    await releaseOnce('close-first');
  });

  it('ignores a relay message from another window', async () => {
    const port = new MessageChannel().port1;
    const listeners: Array<(event?: unknown) => void> = [];
    const target = {
      addEventListener: vi.fn((_name: string, handler: (event?: unknown) => void) => {
        listeners.push(handler);
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const bridge = {
      requestRuntimePort: vi.fn(() => {
        for (const listener of listeners) {
          listener({
            data: { taucadRelay: runtimeRelayTag, hostId: 'forged' },
            ports: [port],
            origin: location.origin,
            source: { note: 'a frame that is not this window' },
          } as unknown as MessageEvent);
        }
      }),
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    const settlement = await Promise.race([
      requestElectronRuntimePort({ bridge, target }).then(() => 'resolved'),
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      }).then(() => 'pending'),
    ]);

    expect(settlement).toBe('pending');
    expect(target.removeEventListener).not.toHaveBeenCalled();
  });

  it('notifies the client of a utility exit code and stops listening after release', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-exit-code');
    const received = await requestElectronRuntimePort({ bridge, target });
    const codes: Array<number | undefined> = [];
    takeElectronRuntimeHostExit(received)?.((exitCode) => codes.push(exitCode));

    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-exit-code', exitCode: 7 }));
    expect(codes).toEqual([7]);

    dispatch('pagehide');
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-exit-code', exitCode: 9 }));
    expect(codes).toEqual([7]);
  });

  it('ignores a host-exit relay addressed to another host', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-mine');
    const received = await requestElectronRuntimePort({ bridge, target });
    const codes: Array<number | undefined> = [];
    takeElectronRuntimeHostExit(received)?.((exitCode) => codes.push(exitCode));

    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-theirs', exitCode: 7 }));

    expect(codes).toEqual([]);
  });
});
