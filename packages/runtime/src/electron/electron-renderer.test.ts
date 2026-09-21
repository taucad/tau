// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  awaitElectronRelayedPort,
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
const relayEvent = (data: unknown, ports: MessagePort[] = [], origin = location.origin): MessageEvent =>
  ({ data, ports, origin, source: globalThis }) as unknown as MessageEvent;

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
    requestRuntimePort: vi.fn((requestId: string) => {
      dispatch('message', relayEvent({ taucadRelay: runtimeRelayTag, hostId, requestId }, [port]));
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
    const requestRuntimePort = vi.fn((requestId: string) => {
      listener?.(relayEvent({ taucadRelay: 'taucad:connect-runtime:port', hostId: 'host-1', requestId }, [port]));
    });
    const bridge = {
      requestRuntimePort,
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: 'taucad:connect-runtime:host-exit', runtime: 'taucad:connect-runtime:port' },
    };

    const received = await requestElectronRuntimePort({ bridge, target });

    expect(received).toBe(port);
    expect(requestRuntimePort).toHaveBeenCalledExactlyOnceWith(expect.any(String), undefined);
    expect(target.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('correlates overlapping runtime requests when replies arrive out of order', async () => {
    let handlers: Array<(event: MessageEvent) => void> = [];
    const removeEventListener = vi.fn((_name: string, handler: (event: MessageEvent) => void) => {
      handlers = handlers.filter((entry) => entry !== handler);
    });
    const target = {
      addEventListener: vi.fn((_name: string, handler: (event: MessageEvent) => void) => {
        handlers = [...handlers, handler];
      }),
      removeEventListener,
    } as unknown as Window;
    const dispatch = (event: MessageEvent): void => {
      for (const handler of handlers) {
        handler(event);
      }
    };
    const requestRuntimePort = vi.fn((..._args: unknown[]) => undefined);
    const bridge = {
      requestRuntimePort,
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };
    const contexts = [
      { definition: 'default', projectRoot: '/projects/a' },
      { definition: 'default', projectRoot: '/projects/b' },
      { definition: 'default', projectRoot: '/projects/c' },
    ];
    const pending = contexts.map(async (context) => requestElectronRuntimePort({ bridge, context, target }));
    const requestHandlers = [...handlers];
    const requestIds = requestRuntimePort.mock.calls.map(([requestId]) => requestId as string);

    dispatch(
      relayEvent({ taucadRelay: runtimeRelayTag, hostId: 'host-without-request' }, [new MessageChannel().port1]),
    );
    dispatch(
      relayEvent({ taucadRelay: runtimeRelayTag, hostId: 'host-wrong-request', requestId: 'wrong-request' }, [
        new MessageChannel().port1,
      ]),
    );
    expect(handlers).toEqual(requestHandlers);

    const ports = [new MessageChannel().port1, new MessageChannel().port1, new MessageChannel().port1];
    for (const index of [2, 0, 1]) {
      dispatch(
        relayEvent({ taucadRelay: runtimeRelayTag, hostId: `host-${index}`, requestId: requestIds[index] }, [
          ports[index]!,
        ]),
      );
    }

    const received = await Promise.all(pending);
    expect(received).toEqual(ports);
    expect(new Set(requestIds).size).toBe(3);
    expect(requestRuntimePort.mock.calls).toEqual(contexts.map((context, index) => [requestIds[index], context]));
    expect(requestIds.every((requestId) => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(requestId))).toBe(true);
    for (const requestHandler of requestHandlers) {
      expect(
        removeEventListener.mock.calls.filter(([name, handler]) => name === 'message' && handler === requestHandler),
      ).toHaveLength(1);
    }

    const clients = received.map((port) => electronUtilityTransport({ port }).materialize());
    await clients[2]!.close();
    await clients[0]!.close();
    await clients[1]!.close();
    expect(bridge.releaseRuntimeHost.mock.calls).toEqual([
      ['host-2', 'requested'],
      ['host-0', 'requested'],
      ['host-1', 'requested'],
    ]);
  });

  it('creates an async client-options provider backed by electronUtilityTransport', async () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    let hostNumber = 0;
    const requestRuntimePort = vi.fn((requestId: string) => {
      hostNumber += 1;
      const port = new MessageChannel().port1;
      listener?.(relayEvent({ taucadRelay: runtimeRelayTag, hostId: `host-${hostNumber}`, requestId }, [port]));
    });
    const bridge = {
      requestRuntimePort,
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    const provider = createElectronClientOptions({
      bridge,
      context: { projectRoot: '/projects/a' },
      renderTimeout: 1234,
      target,
    });
    const options = await provider();
    const nextOptions = await provider();

    /* The per-request fork context survives the provider's own destructuring
     * and reaches preload unchanged. */
    expect(requestRuntimePort.mock.calls).toEqual([
      [expect.any(String), { projectRoot: '/projects/a' }],
      [expect.any(String), { projectRoot: '/projects/a' }],
    ]);
    expect(requestRuntimePort.mock.calls[0]?.[0]).not.toBe(requestRuntimePort.mock.calls[1]?.[0]);
    expect(options.transport).not.toBe(nextOptions.transport);
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
    const nextTransport = nextOptions.transport.materialize();
    if (nextTransport.renderTimeoutRecovery.kind !== 'terminable') {
      throw new Error('Expected terminable Electron transport');
    }
    await nextTransport.renderTimeoutRecovery.terminate();
    expect(bridge.releaseRuntimeHost.mock.calls).toEqual([
      ['host-1', 'render-timeout'],
      ['host-2', 'render-timeout'],
    ]);
  });

  it('materialises inline export bytes on the copy-only Electron transport', async () => {
    const client = electronUtilityTransport({ port: new MessageChannel().port1 }).materialize();

    await expect(
      client.resolveExport?.({
        data: [
          {
            bytes: { bytes: new Uint8Array([1, 2, 3]), delivery: 'inline' },
            mimeType: 'application/step',
            name: 'model.step',
          },
        ],
        issues: [],
        success: true,
      }),
    ).resolves.toMatchObject({
      data: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/step', name: 'model.step' }],
      success: true,
    });

    await client.close();
  });

  it('should reject a runtime port request with the reason main refused it for', async () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const bridge = {
      /* A refusal carries a reason and no lease: the utility whose `hostId` a
       * served request reports was never forked. */
      requestRuntimePort: vi.fn((requestId: string) => {
        listener?.(
          relayEvent({
            taucadRelay: runtimeRelayTag,
            requestId,
            error: 'registerElectronRuntimeMain: refusing to exceed 1 utility processes',
          }),
        );
      }),
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    await expect(requestElectronRuntimePort({ bridge, target })).rejects.toThrow(
      'refusing to exceed 1 utility processes',
    );
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should close a relayed port that carries no host lease and say so', async () => {
    const port = new MessageChannel().port1;
    const close = vi.spyOn(port, 'close');
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const bridge = {
      /* A port with neither a lease nor a reason: the caller could never
       * release the utility behind it, so the port is closed rather than used. */
      requestRuntimePort: vi.fn((requestId: string) => {
        listener?.(relayEvent({ taucadRelay: runtimeRelayTag, requestId }, [port]));
      }),
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    await expect(requestElectronRuntimePort({ bridge, target })).rejects.toThrow(
      'preload relay omitted the runtime host ID',
    );
    expect(close).toHaveBeenCalledOnce();
    expect(bridge.releaseRuntimeHost).not.toHaveBeenCalled();
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
      requestRuntimePort: vi.fn((requestId: string) => {
        for (const listener of listeners) {
          listener({
            data: { taucadRelay: runtimeRelayTag, hostId: 'forged', requestId },
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

  it('accepts the relay when an opaque document reports origin "null"', async () => {
    /* Electron 43 on a `file://` document: `location.origin` is `'file://'`
     * while the same-window relay event carries `'null'`. Under 36 both sides
     * stringified as `'null'`. Source identity is what fences the relay; the
     * origin strings must not decide it. See L5's diagnosis in
     * `desktop-shell-topology-blueprint.md`. */
    const port = new MessageChannel().port1;
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const bridge = {
      requestRuntimePort: vi.fn((requestId: string) => {
        /* A foreign frame first, with the same opaque origin: rejected on
         * source identity alone, exactly as with a matching origin. */
        listener?.({
          data: { taucadRelay: runtimeRelayTag, hostId: 'forged', requestId },
          ports: [new MessageChannel().port1],
          origin: 'null',
          source: { note: 'a frame that is not this window' },
        } as unknown as MessageEvent);
        listener?.(relayEvent({ taucadRelay: runtimeRelayTag, hostId: 'host-file', requestId }, [port], 'null'));
      }),
      releaseRuntimeHost: vi.fn(),
      relayTag: { hostExit: hostExitRelayTag, runtime: runtimeRelayTag },
    };

    await expect(requestElectronRuntimePort({ bridge, target })).resolves.toBe(port);
  });

  describe('awaitElectronRelayedPort', () => {
    /**
     * A listener-capturing target plus the four relays the guard must
     * separate: a foreign frame, the wrong tag, a non-matching payload, and
     * the real one. Every non-runtime Electron port hand-off in the tree
     * lands on this predicate, so all four are asserted in one place.
     *
     * @returns The target and a dispatcher over its captured listeners.
     */
    const relayTarget = () => {
      /* Every removal replaces the array rather than splicing it, so the
       * reference this loop holds stays safe when a handler unsubscribes. */
      let listeners: Array<(event: MessageEvent) => void> = [];
      const target = {
        addEventListener: vi.fn((_name: string, handler: (event: MessageEvent) => void) => {
          listeners = [...listeners, handler];
        }),
        removeEventListener: vi.fn((_name: string, handler: (event: MessageEvent) => void) => {
          listeners = listeners.filter((entry) => entry !== handler);
        }),
      } as unknown as Window;
      const deliver = (event: MessageEvent): void => {
        for (const listener of listeners) {
          listener(event);
        }
      };
      return { deliver, target };
    };

    const servicesTag = 'tau:services-port';

    it('resolves on a same-window relay whose payload matches', async () => {
      const { deliver, target } = relayTarget();
      const port = new MessageChannel().port1;
      const pending = awaitElectronRelayedPort(servicesTag, (payload) => payload['requestId'] === 'req-1', target);

      deliver(relayEvent({ taucadRelay: servicesTag, requestId: 'req-1' }, [port]));

      await expect(pending).resolves.toBe(port);
      expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('accepts an opaque document reporting origin "null"', async () => {
      const { deliver, target } = relayTarget();
      const port = new MessageChannel().port1;
      const pending = awaitElectronRelayedPort(servicesTag, () => true, target);

      deliver(relayEvent({ taucadRelay: servicesTag }, [port], 'null'));

      await expect(pending).resolves.toBe(port);
    });

    it('should reject a relayed port request that main refuses', async () => {
      const { deliver, target } = relayTarget();
      const pending = awaitElectronRelayedPort(servicesTag, (payload) => payload['requestId'] === 'req-1', target);

      deliver(relayEvent({ taucadRelay: servicesTag, requestId: 'req-1', error: 'services.untrusted-root' }));

      await expect(pending).rejects.toThrow('services.untrusted-root');
      expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('ignores a foreign source, a foreign tag, and a payload the matcher rejects', async () => {
      const { deliver, target } = relayTarget();
      const mine = new MessageChannel().port1;
      const pending = awaitElectronRelayedPort(servicesTag, (payload) => payload['requestId'] === 'mine', target);

      deliver({
        data: { taucadRelay: servicesTag, requestId: 'mine' },
        ports: [new MessageChannel().port1],
        origin: 'null',
        source: { note: 'a frame that is not this window' },
      } as unknown as MessageEvent);
      deliver(relayEvent({ taucadRelay: 'other:tag', requestId: 'mine' }, [new MessageChannel().port1]));
      deliver(relayEvent({ taucadRelay: servicesTag, requestId: 'theirs' }, [new MessageChannel().port1]));

      const settlement = await Promise.race([
        pending.then(() => 'resolved'),
        new Promise((resolve) => {
          setTimeout(resolve, 0);
        }).then(() => 'pending'),
      ]);
      expect(settlement).toBe('pending');
      expect(target.removeEventListener).not.toHaveBeenCalled();

      deliver(relayEvent({ taucadRelay: servicesTag, requestId: 'mine' }, [mine]));
      await expect(pending).resolves.toBe(mine);
    });
  });

  it('notifies the client of a utility exit report and retires the listener with it', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-exit-code');
    const received = await requestElectronRuntimePort({ bridge, target });
    const reports: unknown[] = [];
    takeElectronRuntimeHostExit(received)?.((detail) => reports.push(detail));

    dispatch(
      'message',
      relayEvent({
        taucadRelay: hostExitRelayTag,
        hostId: 'host-exit-code',
        exitCode: 7,
        released: false,
        stderrTail: 'boot: missing entry\n',
      }),
    );
    expect(reports).toEqual([{ exitCode: 7, released: false, stderrTail: 'boot: missing entry\n' }]);
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));

    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-exit-code', exitCode: 9 }));
    expect(reports).toHaveLength(1);
  });

  it('keeps the host-exit listener alive across release so a kill is still explained', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-released');
    const received = await requestElectronRuntimePort({ bridge, target });
    const reports: unknown[] = [];
    takeElectronRuntimeHostExit(received)?.((detail) => reports.push(detail));
    const client = electronUtilityTransport({ port: received }).materialize();

    /* `release()` asks main to kill; main's relay lands after it. */
    await client.close();
    expect(bridge.releaseRuntimeHost).toHaveBeenCalledExactlyOnceWith('host-released', 'requested');

    dispatch(
      'message',
      relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-released', exitCode: 0, released: true }),
    );
    expect(reports).toEqual([{ exitCode: 0, released: true }]);
  });

  it('stops listening for a host exit once the page is hidden', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-hidden-exit');
    const received = await requestElectronRuntimePort({ bridge, target });
    const reports: unknown[] = [];
    takeElectronRuntimeHostExit(received)?.((detail) => reports.push(detail));

    dispatch('pagehide');
    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-hidden-exit', exitCode: 9 }));

    expect(reports).toEqual([]);
  });

  it('ignores a host-exit relay addressed to another host', async () => {
    const { takeElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const { bridge, target, dispatch } = setupRendererHarness('host-mine');
    const received = await requestElectronRuntimePort({ bridge, target });
    const reports: unknown[] = [];
    takeElectronRuntimeHostExit(received)?.((detail) => reports.push(detail));

    dispatch('message', relayEvent({ taucadRelay: hostExitRelayTag, hostId: 'host-theirs', exitCode: 7 }));

    expect(reports).toEqual([]);
  });
});
