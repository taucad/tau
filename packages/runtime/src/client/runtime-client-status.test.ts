/* eslint-disable @typescript-eslint/naming-convention -- test data uses virtual paths as object keys */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { createRuntimeClient, RuntimeNotConnectedError, RuntimeTerminatedError } from '#client/runtime-client-core.js';
import type { RenderStatus } from '#client/runtime-client-core.js';
import { RenderTimeoutError } from '#framework/runtime-worker-client.js';
import type { GeometryTransport, RuntimeProtocol, WorkerState } from '#types/runtime-protocol.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
import type {
  RuntimeTransportClient,
  RuntimeTransportRenderTarget,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

type NotifyHandlers = {
  stateChanged?: (
    args: RuntimeProtocol['notifies']['stateChanged']['args'] & { readonly abortGeneration: number },
  ) => void;
  geometryComputed?: (args: RuntimeProtocol['notifies']['geometryComputed']['args']) => void;
  errorEvent?: (args: RuntimeProtocol['notifies']['errorEvent']['args']) => void;
  parametersResolved?: (args: RuntimeProtocol['notifies']['parametersResolved']['args']) => void;
  progress?: (args: RuntimeProtocol['notifies']['progress']['args']) => void;
  activeKernelChanged?: (args: RuntimeProtocol['notifies']['activeKernelChanged']['args']) => void;
};

const successGeometry = (hash: string): Omit<RuntimeProtocol['notifies']['geometryComputed']['args'], 'renderId'> => ({
  result: {
    success: true,
    data: {
      format: 'gltf',
      hash,
      content: { delivery: 'inline', bytes: new Uint8Array([1, 2, 3]) },
    },
    issues: [],
  },
});

const failureGeometry = (): Omit<RuntimeProtocol['notifies']['geometryComputed']['args'], 'renderId'> => ({
  result: {
    success: false,
    issues: [{ message: 'bad model', code: 'RUNTIME', severity: 'error' }],
  },
});

function createStatusClientFixture(options?: {
  readonly renderTimeout?: number;
  readonly resolveGeometry?: (geometry: GeometryTransport) => Promise<Geometry>;
  readonly config?: unknown;
  readonly reservePreview?: RuntimeTransportClient['reservePreview'];
  readonly initialize?: RuntimeTransportClient['initialize'];
}): {
  readonly client: ReturnType<typeof createRuntimeClient>;
  readonly handlers: NotifyHandlers;
  readonly notify: ReturnType<typeof vi.fn<(name: string, args: unknown) => void>>;
  readonly abort: ReturnType<typeof vi.fn<(target: RuntimeTransportRenderTarget) => void>>;
  readonly reservePreview: ReturnType<typeof vi.fn<RuntimeTransportClient['reservePreview']>>;
  readonly initialize: ReturnType<typeof vi.fn<RuntimeTransportClient['initialize']>>;
  readonly onNotify: ReturnType<typeof vi.fn>;
  readonly liveNotifyCount: (name: keyof RuntimeProtocol['notifies']) => number;
  readonly handlersReady: Promise<void>;
  readonly call: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly terminateHost: ReturnType<typeof vi.fn>;
  readonly closeTransport: (result: Awaited<RuntimeTransportClient['closed']>) => void;
} {
  const handlers: NotifyHandlers = {};
  const handlersReadySlot = Promise.withResolvers<void>();
  const notify = vi.fn<(name: string, args: unknown) => void>();
  const call = vi.fn(async (name: keyof RuntimeProtocol['calls']) => {
    if (name === 'cleanup') {
      return null;
    }
    throw new Error('Unexpected RPC call');
  });
  const channelCall = call as unknown as Channel<RuntimeProtocol>['call'];
  /* Live (subscribed-and-not-unsubscribed) handlers per notify name. Every
   * scripted name fans out to ALL live handlers and the returned unsubscribe
   * really removes one, so duplicate subscriptions and leaked handler sets are
   * observable instead of being hidden by last-writer-wins overwrites. */
  const liveHandlers = new Map<string, Set<(args: never) => void>>();
  const liveNotifyCount = (name: keyof RuntimeProtocol['notifies']): number => liveHandlers.get(name)?.size ?? 0;
  const scriptedNotifyNames: ReadonlySet<string> = new Set([
    'stateChanged',
    'geometryComputed',
    'errorEvent',
    'parametersResolved',
    'progress',
    'activeKernelChanged',
  ]);
  const onNotify = vi.fn((name: keyof RuntimeProtocol['notifies'], handler: (args: never) => void) => {
    let subscribers = liveHandlers.get(name);
    if (!subscribers) {
      const created = new Set<(args: never) => void>();
      subscribers = created;
      liveHandlers.set(name, created);
      if (scriptedNotifyNames.has(name)) {
        (handlers as Record<string, (args: never) => void>)[name] = (args) => {
          for (const subscriber of created) {
            subscriber(args);
          }
        };
      }
    }
    const subscribed = subscribers;
    subscribed.add(handler);
    if (handlers.stateChanged && handlers.geometryComputed) {
      handlersReadySlot.resolve();
    }
    return () => {
      subscribed.delete(handler);
    };
  });
  const channel: Channel<RuntimeProtocol> = {
    ready: Promise.resolve(),
    closed: Promise.resolve(),
    port: {
      postMessage: vi.fn(),
      onMessage: vi.fn(() => () => undefined),
      close: vi.fn(),
    },
    hello: { payload: { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', protocolVersion } },
    onNotify: onNotify as Channel<RuntimeProtocol>['onNotify'],
    notify,
    call: channelCall,
    listen: vi.fn(() => {
      throw new Error('Unexpected RPC listen');
    }),
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  };
  let resolveClosed!: (result: Awaited<RuntimeTransportClient['closed']>) => void;
  const closed = new Promise<Awaited<RuntimeTransportClient['closed']>>((resolve) => {
    resolveClosed = resolve;
  });
  const close = vi.fn(async () => {
    resolveClosed({ cause: 'requested' });
  });
  const abort = vi.fn<(target: RuntimeTransportRenderTarget) => void>();
  const reservePreview = vi.fn<RuntimeTransportClient['reservePreview']>(options?.reservePreview ?? (() => ({})));
  const initialize = vi.fn<RuntimeTransportClient['initialize']>(
    options?.initialize ?? (async () => ({ capabilities: { registrations: [], routes: [], renderCapabilities: {} } })),
  );
  const terminateHost = vi.fn(async () => {
    resolveClosed({ cause: 'render-timeout' });
  });
  const transport: RuntimeTransportClient = {
    id: 'status-test',
    closed,
    reservePreview,
    renderTimeoutRecovery: {
      kind: 'terminable',
      abortRender: abort,
      terminate: terminateHost,
    },
    describe: () => ({
      id: 'status-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize,
    resolveGeometry: vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => {
      if (options?.resolveGeometry) {
        return options.resolveGeometry(geometry);
      }
      if (geometry.format !== 'gltf' || geometry.content.delivery !== 'inline') {
        throw new Error('Expected inline GLTF geometry');
      }
      return { format: 'gltf', content: geometry.content.bytes, hash: geometry.hash };
    }),
    close,
  };
  const plugin: TransportPlugin = {
    id: 'status-test',
    describe: transport.describe,
    materialize: () => transport,
  };

  return {
    client: createRuntimeClient<AnyRuntimeDefinition>({
      transport: plugin,
      ...(options?.renderTimeout === undefined ? {} : { renderTimeout: options.renderTimeout }),
      ...(options?.config === undefined ? {} : { config: options.config }),
    }),
    handlers,
    notify,
    abort,
    reservePreview,
    initialize,
    onNotify,
    liveNotifyCount,
    handlersReady: handlersReadySlot.promise,
    call,
    close,
    terminateHost,
    closeTransport: resolveClosed,
  };
}

const renderIdFromNotify = (
  notify: ReturnType<typeof vi.fn<(name: string, args: unknown) => void>>,
  callIndex: number,
): string => {
  const payload = notify.mock.calls[callIndex]?.[1];
  if (!payload || typeof payload !== 'object' || !('renderId' in payload) || typeof payload.renderId !== 'string') {
    throw new TypeError(`Expected notify call ${callIndex} to carry a renderId`);
  }
  return payload.renderId;
};

const nextTask = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const waitForRuntimeNotifyHandlers = async (handlers: NotifyHandlers, attempts = 20): Promise<void> => {
  if (handlers.stateChanged && handlers.geometryComputed) {
    return;
  }
  if (attempts <= 0) {
    throw new Error('Runtime notify handlers were not registered');
  }
  await nextTask();
  await waitForRuntimeNotifyHandlers(handlers, attempts - 1);
};

describe('RuntimeClient renderStatus', () => {
  it('should share one lazy connection attempt across concurrent callers (T1)', async () => {
    const configGate = Promise.withResolvers<unknown>();
    const config = vi.fn(async () => configGate.promise);
    const { client, initialize, onNotify } = createStatusClientFixture({ config });

    const first = client.connect();
    const second = client.connect();
    configGate.resolve({ endpoint: 'test' });

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(config).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledOnce();
    expect(onNotify.mock.calls.filter(([name]) => name === 'stateChanged')).toHaveLength(2);
    expect(onNotify.mock.calls.filter(([name]) => name === 'capabilitiesUpdated')).toHaveLength(2);
    client.terminate();
  });

  it('should coalesce a stale rapid-start render without duplicate initialization (T2)', async () => {
    const configGate = Promise.withResolvers<unknown>();
    const config = vi.fn(async () => configGate.promise);
    const { client, handlers, handlersReady, notify, initialize } = createStatusClientFixture({ config });

    const first = client.render({ source: { path: 'first.ts' } });
    const second = client.render({ source: { path: 'second.ts' } });
    configGate.resolve({ endpoint: 'test' });
    await handlersReady;

    await expect(first).resolves.toEqual({ superseded: true });
    expect(config).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toBe('openFile');
    expect(notify.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ file: { path: '', filename: 'second.ts' } }));

    const secondRenderId = renderIdFromNotify(notify, 0);
    handlers.geometryComputed?.({ ...successGeometry('second'), renderId: secondRenderId });
    await expect(second).resolves.toMatchObject({ superseded: false });
    client.terminate();
  });

  it('should keep one live initialization and subscription set across a connect retry (T34)', async () => {
    let attempts = 0;
    const { client, initialize, onNotify, liveNotifyCount } = createStatusClientFixture({
      initialize: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('transport initialize failed');
        }
        return { capabilities: { registrations: [], routes: [], renderCapabilities: {} } };
      },
    });

    await expect(client.connect()).rejects.toThrow('transport initialize failed');
    await expect(client.connect()).resolves.toBeUndefined();

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(onNotify.mock.calls.filter(([name]) => name === 'stateChanged')).toHaveLength(4);
    expect(liveNotifyCount('stateChanged')).toBe(2);
    expect(liveNotifyCount('capabilitiesUpdated')).toBe(2);
    client.terminate();
  });

  it('should settle every caller of a failing concurrent connect (T34)', async () => {
    const { client, initialize } = createStatusClientFixture({
      initialize: async () => {
        throw new Error('transport initialize failed');
      },
    });

    const first = client.connect();
    const second = client.connect();

    await expect(first).rejects.toThrow('transport initialize failed');
    await expect(second).rejects.toThrow('transport initialize failed');
    expect(initialize).toHaveBeenCalledOnce();
    client.terminate();
  });

  it('should validate render source before admission and preserve autonomous handoff (T3)', async () => {
    const { client, handlers, handlersReady, notify, reservePreview } = createStatusClientFixture();
    const hashes: string[] = [];
    client.on('geometry', (result) => {
      if (result.success) {
        hashes.push(result.data.hash);
      }
    });
    await client.connect();
    await handlersReady;

    const valid = client.render({ source: { path: 'valid.ts' } });
    await Promise.resolve();
    const validRenderId = renderIdFromNotify(notify, 0);
    await expect(client.render({ source: { path: '../invalid.ts' } })).rejects.toThrow();
    const preHandoff = await Promise.race([valid.then(() => 'settled'), Promise.resolve('pending')]);

    expect(preHandoff).toBe('pending');
    expect(reservePreview).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();

    const watcherRenderId = '550e8400-e29b-41d4-a716-446655440101';
    handlers.stateChanged?.({ renderId: validRenderId, abortGeneration: 1, state: 'rendering' });
    handlers.stateChanged?.({ renderId: validRenderId, abortGeneration: 1, state: 'idle' });
    handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.geometryComputed?.({ ...successGeometry('watcher'), renderId: watcherRenderId });

    await expect(valid).resolves.toEqual({ superseded: true });
    expect(hashes).toEqual(['watcher']);
    client.terminate();
  });

  it('should construct a replacement admission before retiring the selected preview (T5)', async () => {
    let reservationCount = 0;
    const { client, handlers, handlersReady, notify } = createStatusClientFixture({
      reservePreview: () => {
        reservationCount++;
        if (reservationCount === 2) {
          throw new Error('reservation failed');
        }
        return {};
      },
    });
    const states: WorkerState[] = [];
    client.on('state', (state) => states.push(state));
    await client.connect();
    await handlersReady;

    const first = client.render({ source: { path: 'first.ts' } });
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    await expect(client.render({ source: { path: 'second.ts' } })).rejects.toThrow('reservation failed');

    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('first'), renderId: firstRenderId });

    await expect(first).resolves.toMatchObject({ superseded: false });
    expect(states).toEqual(['rendering']);
    client.terminate();
  });

  it('stages one canonical inline entry identity', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const settlement = client.render({
      source: {
        files: { 'src/main.ts': 'export const main = () => null;' },
        entry: 'src/main.ts',
      },
    });
    await waitForRuntimeNotifyHandlers(handlers);

    expect(notify).toHaveBeenCalledOnce();
    const [name, payload] = notify.mock.calls[0] ?? [];
    expect(name).toBe('stage-and-render');
    if (payload === null || typeof payload !== 'object') {
      throw new TypeError('Expected a stage-and-render payload');
    }
    const { stage, file } = payload as { stage?: unknown; file?: unknown };
    expect(file).toEqual({ path: 'src', filename: 'main.ts' });
    if (stage === null || typeof stage !== 'object') {
      throw new TypeError('Expected a stage map');
    }
    expect((stage as Record<string, unknown>)['src/main.ts']).toBeInstanceOf(Uint8Array);

    handlers.geometryComputed?.({ ...successGeometry('canonical'), renderId: renderIdFromNotify(notify, 0) });
    await settlement;
    client.terminate();
  });

  it('canonicalizes a nested filesystem entry path before worker delivery', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const settlement = client.render({ source: { path: 'lib/cube.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);

    expect(notify).toHaveBeenCalledWith(
      'openFile',
      expect.objectContaining({
        file: { path: 'lib', filename: 'cube.ts' },
        parameters: {},
      }),
    );
    expect(renderIdFromNotify(notify, 0)).toBeTypeOf('string');

    handlers.geometryComputed?.({ ...successGeometry('nested'), renderId: renderIdFromNotify(notify, 0) });
    await settlement;
    client.terminate();
  });

  it('rejects canonical inline aliases before opening or staging the transport', async () => {
    const { client, notify } = createStatusClientFixture();

    await expect(
      client.render({
        source: {
          files: {
            'main.ts': 'first',
            'src/../main.ts': 'second',
          },
          entry: 'main.ts',
        },
      }),
    ).rejects.toThrow('Invalid virtual path');
    expect(notify).not.toHaveBeenCalled();
    client.terminate();
  });

  it('rejects traversal and URL-like filesystem sources before transport access', async () => {
    for (const path of ['../secret.ts', 'https://example.test/main.ts']) {
      const { client, notify } = createStatusClientFixture();
      // oxlint-disable-next-line no-await-in-loop -- each case proves an isolated client performs no access
      await expect(client.render({ source: { path } })).rejects.toThrow();
      expect(notify).not.toHaveBeenCalled();
      client.terminate();
    }
  });

  it('should emit connecting, rendering, and ready for a successful render', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const settlement = client.render({ source: { path: 'main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    const renderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'buffering' });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('h-1'), renderId });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'idle' });

    await expect(settlement).resolves.toMatchObject({ superseded: false });
    expect(statuses).toEqual(['connecting', 'rendering', 'ready']);
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('should clear render failure on the next render and recover to ready', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const failed = client.render({ source: { path: 'main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    const failedRenderId = renderIdFromNotify(notify, 0);
    handlers.geometryComputed?.({ ...failureGeometry(), renderId: failedRenderId });
    await expect(failed).resolves.toMatchObject({ superseded: false });
    expect(client.renderStatus).toBe('error');

    const recovered = client.render({ source: { path: 'main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    const recoveredRenderId = renderIdFromNotify(notify, 1);
    handlers.stateChanged?.({ renderId: recoveredRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('h-2'), renderId: recoveredRenderId });
    handlers.stateChanged?.({ renderId: recoveredRenderId, abortGeneration: 2, state: 'idle' });

    await expect(recovered).resolves.toMatchObject({ superseded: false });
    expect(statuses).toContain('error');
    expect(statuses.slice(statuses.indexOf('error') + 1)).toEqual(['rendering', 'ready']);
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('should emit each derived status once until it changes', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const settlement = client.render({ source: { path: 'main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    const renderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'buffering' });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'buffering' });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('h-1'), renderId });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'idle' });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'idle' });

    await expect(settlement).resolves.toMatchObject({ superseded: false });
    expect(statuses).toEqual(['connecting', 'rendering', 'ready']);
    client.terminate();
  });

  it('should map termination to error', () => {
    const { client } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    client.terminate();

    expect(statuses).toEqual(['error']);
    expect(client.renderStatus).toBe('error');
  });

  it('closes admission, drains accepted work, acknowledges cleanup, then closes transport', async () => {
    const { client, handlers, notify, call, close } = createStatusClientFixture();
    const render = client.render({ source: { path: 'main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);

    const shutdown = client.shutdown({ drain: true });
    await expect(client.render({ source: { path: 'other.ts' } })).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
    });
    expect(call).not.toHaveBeenCalledWith('cleanup', undefined);

    handlers.geometryComputed?.({ ...successGeometry('drained'), renderId: renderIdFromNotify(notify, 0) });
    await render;
    await shutdown;

    expect(call).toHaveBeenCalledExactlyOnceWith('cleanup', undefined);
    expect(close).toHaveBeenCalledOnce();
    expect(call.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]!);
  });
});

describe('RuntimeClient render timeout control plane', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the connected timeout synchronously without render intent', async () => {
    const { client, notify, abort } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    const geometries: Geometry[] = [];
    await client.connect();
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });
    client.on('geometry', (result) => {
      if (result.success) {
        geometries.push(result.data);
      }
    });
    notify.mockClear();
    abort.mockClear();

    client.setRenderTimeout(750);
    expect(notify).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
    expect(geometries).toEqual([]);

    client.terminate();
  });

  it('captures the configured deadline on the first lazily connected render', async () => {
    const { client, notify, abort } = createStatusClientFixture({ renderTimeout: 50 });
    vi.useFakeTimers();

    const render = client.render({ source: { path: 'first.ts' } });
    const renderTimeoutSettlement = expect(render).rejects.toEqual(new RenderTimeoutError(50));
    for (let attempt = 0; attempt < 20 && notify.mock.calls.length === 0; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- drains the lazy connection promise chain without advancing timers
      await Promise.resolve();
    }
    expect(notify).toHaveBeenCalledOnce();
    const renderId = renderIdFromNotify(notify, 0);

    await vi.advanceTimersByTimeAsync(49);
    expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await renderTimeoutSettlement;
    expect(abort).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ renderId }));
    client.terminate();
  });

  it('throws typed lifecycle errors synchronously', async () => {
    const disconnected = createStatusClientFixture().client;
    expect(() => {
      disconnected.setRenderTimeout(-1);
    }).toThrow(RuntimeNotConnectedError);
    disconnected.terminate();

    const terminated = createStatusClientFixture().client;
    await terminated.connect();
    terminated.terminate();
    expect(() => {
      terminated.setRenderTimeout(-1);
    }).toThrow(RuntimeTerminatedError);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid timeout %s synchronously',
    async (renderTimeout) => {
      const { client } = createStatusClientFixture();
      await client.connect();

      expect(() => {
        client.setRenderTimeout(renderTimeout);
      }).toThrow(new TypeError('renderTimeout must be a finite, non-negative number of milliseconds.'));

      client.terminate();
    },
  );

  it('uses the new timeout for later renders without rescheduling an in-flight render', async () => {
    const { client, handlers, notify, abort } = createStatusClientFixture();
    await client.connect();
    client.setRenderTimeout(500);
    vi.useFakeTimers();

    const first = client.render({ source: { path: 'main.ts' } });
    const firstTimeout = expect(first).rejects.toEqual(new RenderTimeoutError(500));
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    abort.mockClear();
    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(250);
    client.setRenderTimeout(1000);
    await vi.advanceTimersByTimeAsync(249);
    expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(abort).toHaveBeenCalledOnce();
    expect(abort.mock.calls[0]?.[0]).toEqual({ renderId: renderIdFromNotify(notify, 0) });

    handlers.errorEvent?.({
      renderId: firstRenderId,
      issues: [{ message: 'render timed out', code: 'RENDER_TIMEOUT', severity: 'error' }],
    });
    await firstTimeout;
    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'error' });

    abort.mockClear();
    const second = client.render({ source: { path: 'main.ts' } });
    const secondTimeout = expect(second).rejects.toEqual(new RenderTimeoutError(1000));
    await Promise.resolve();
    const secondRenderId = renderIdFromNotify(notify, 1);
    abort.mockClear();
    handlers.stateChanged?.({ renderId: secondRenderId, abortGeneration: 2, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(999);
    expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(abort).toHaveBeenCalledOnce();
    expect(abort.mock.calls[0]?.[0]).toEqual({ renderId: renderIdFromNotify(notify, 1) });
    await secondTimeout;

    client.terminate();
  });

  it('does not let a superseded render timer target its successor at the deadline boundary', async () => {
    const { client, handlers, notify, abort } = createStatusClientFixture({ renderTimeout: 100 });
    await client.connect();
    vi.useFakeTimers();

    const first = client.render({ source: { path: 'first.ts' } });
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(99);

    const second = client.render({ source: { path: 'second.ts' } });
    await Promise.resolve();
    const secondRenderId = renderIdFromNotify(notify, 1);
    await expect(first).resolves.toEqual({ superseded: true });

    await vi.advanceTimersByTimeAsync(1);
    expect(abort).not.toHaveBeenCalled();
    handlers.geometryComputed?.({ ...successGeometry('second'), renderId: secondRenderId });
    await expect(second).resolves.toMatchObject({ superseded: false });

    client.terminate();
  });

  it('ignores a local deadline callback after the selected render has settled', async () => {
    const { client, handlers, notify, abort } = createStatusClientFixture({ renderTimeout: 100 });
    const errors: string[] = [];
    client.on('error', (issues) => {
      errors.push(...issues.map((issue) => issue.code));
    });
    await client.connect();
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const render = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    const timeoutCallback = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 100)?.[0];
    if (typeof timeoutCallback !== 'function') {
      throw new TypeError('Expected the selected render deadline callback');
    }

    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('settled'), renderId });
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'idle' });
    await expect(render).resolves.toMatchObject({ superseded: false });
    expect(client.renderStatus).toBe('ready');

    timeoutCallback();

    expect(errors).toEqual([]);
    expect(abort).not.toHaveBeenCalled();
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('settles a timeout locally, then flushes the latest successor after matching worker acknowledgement', async () => {
    const { client, handlers, notify, abort, terminateHost } = createStatusClientFixture({ renderTimeout: 100 });
    await client.connect();
    vi.useFakeTimers();

    const first = client.render({ source: { path: 'first.ts' } });
    const firstTimeout = expect(first).rejects.toEqual(new RenderTimeoutError(100));
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(100);
    await firstTimeout;
    expect(abort).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ renderId: firstRenderId }));

    const second = client.render({ source: { path: 'second.ts' } });
    await Promise.resolve();
    expect(notify).toHaveBeenCalledTimes(1);

    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'error' });
    expect(notify).toHaveBeenCalledTimes(2);
    const secondRenderId = renderIdFromNotify(notify, 1);
    handlers.stateChanged?.({ renderId: secondRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('second'), renderId: secondRenderId });

    await expect(second).resolves.toMatchObject({ superseded: false });
    expect(terminateHost).not.toHaveBeenCalled();
    client.terminate();
  });

  it('rejects at the local deadline even when the worker never acknowledges timeout cancellation', async () => {
    const { client, handlers, notify, abort, terminateHost } = createStatusClientFixture({ renderTimeout: 75 });
    const errors: KernelIssue[] = [];
    client.on('error', (issues) => {
      errors.push(...issues);
    });
    await client.connect();
    vi.useFakeTimers();

    const render = client.render({ source: { path: 'blocked.ts' } });
    const renderTimeoutSettlement = expect(render).rejects.toEqual(new RenderTimeoutError(75));
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'rendering' });

    await vi.advanceTimersByTimeAsync(75);
    await renderTimeoutSettlement;
    expect(errors).toEqual([
      {
        message: 'Render timed out after 75 ms.',
        code: 'RENDER_TIMEOUT',
        type: 'runtime',
        severity: 'error',
      },
    ]);
    expect(abort).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ renderId }));
    expect(terminateHost).not.toHaveBeenCalled();

    client.terminate();
  });

  it('rejects recovery-queued work with render-timeout after bounded host recovery expires', async () => {
    const { client, handlers, notify, terminateHost } = createStatusClientFixture({ renderTimeout: 50 });
    await client.connect();
    vi.useFakeTimers();

    const blocked = client.render({ source: { path: 'blocked.ts' } });
    const blockedTimeout = expect(blocked).rejects.toEqual(new RenderTimeoutError(50));
    await Promise.resolve();
    const blockedRenderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId: blockedRenderId, abortGeneration: 1, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(50);
    await blockedTimeout;

    const queued = client.render({ source: { path: 'queued.ts' } });
    const queuedTermination = expect(queued).rejects.toMatchObject({
      name: 'RuntimeTerminatedError',
      causeKind: 'render-timeout',
    });
    await Promise.resolve();
    expect(notify).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await queuedTermination;
    expect(terminateHost).toHaveBeenCalledOnce();
    expect(client.lifecycleState).toBe('terminated');
  });

  it('should still escalate to host termination when timeout cancellation throws (F15)', async () => {
    const { client, handlers, notify, abort, terminateHost } = createStatusClientFixture({ renderTimeout: 50 });
    abort.mockImplementation(() => {
      throw new Error('abort channel closed');
    });
    await client.connect();
    vi.useFakeTimers();

    const blocked = client.render({ source: { path: 'blocked.ts' } });
    const blockedTimeout = expect(blocked).rejects.toEqual(new RenderTimeoutError(50));
    await Promise.resolve();
    const blockedRenderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId: blockedRenderId, abortGeneration: 1, state: 'rendering' });

    await vi.advanceTimersByTimeAsync(50);
    await blockedTimeout;
    expect(abort).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1000);
    expect(terminateHost).toHaveBeenCalledOnce();
    expect(client.lifecycleState).toBe('terminated');
  });

  it('should treat a selected scoped error as terminal without timeout recovery (T15)', async () => {
    const { client, handlers, handlersReady, notify, abort, terminateHost } = createStatusClientFixture({
      renderTimeout: 25,
    });
    await client.connect();
    await handlersReady;
    vi.useFakeTimers();

    const render = client.render({ source: { path: 'invalid-stage.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    handlers.errorEvent?.({
      renderId,
      issues: [{ message: 'staging failed', code: 'RUNTIME', severity: 'error' }],
    });

    await expect(render).rejects.toThrow('staging failed');
    await vi.advanceTimersByTimeAsync(25 + 1000);
    expect(abort).not.toHaveBeenCalled();
    expect(terminateHost).not.toHaveBeenCalled();
    client.terminate();
  });

  it('should publish one failure when selected geometry resolution fails (T22)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture({
      resolveGeometry: async () => {
        throw new Error('pool entry missing');
      },
    });
    const failures: string[] = [];
    client.on('geometry', (result) => {
      if (!result.success) {
        failures.push(result.issues[0]?.message ?? 'missing issue');
      }
    });
    await client.connect();
    await handlersReady;

    const render = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    handlers.geometryComputed?.({ ...successGeometry('missing'), renderId });

    await expect(render).resolves.toMatchObject({ superseded: false, geometry: { success: false } });
    expect(failures).toEqual(['pool entry missing']);
    client.terminate();
  });

  it('should discard a stale geometry resolution failure without disturbing its successor (T22)', async () => {
    const staleResolution = Promise.withResolvers<Geometry>();
    const { client, handlers, handlersReady, notify } = createStatusClientFixture({
      resolveGeometry: async (geometry) => {
        if (geometry.format === 'gltf' && geometry.hash === 'stale-failure') {
          return staleResolution.promise;
        }
        if (geometry.format !== 'gltf' || geometry.content.delivery !== 'inline') {
          throw new Error('Expected inline GLTF geometry');
        }
        return { format: 'gltf', content: geometry.content.bytes, hash: geometry.hash };
      },
    });
    const published: Array<{ success: boolean; hash?: string }> = [];
    client.on('geometry', (result) => {
      published.push(result.success ? { success: true, hash: result.data.hash } : { success: false });
    });
    await client.connect();
    await handlersReady;

    const first = client.render({ source: { path: 'first.ts' } });
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    handlers.geometryComputed?.({ ...successGeometry('stale-failure'), renderId: firstRenderId });

    const second = client.render({ source: { path: 'second.ts' } });
    await Promise.resolve();
    const secondRenderId = renderIdFromNotify(notify, 1);
    await expect(first).resolves.toEqual({ superseded: true });
    staleResolution.reject(new Error('stale pool failure'));
    handlers.geometryComputed?.({ ...successGeometry('successor'), renderId: secondRenderId });

    await expect(second).resolves.toMatchObject({ superseded: false });
    expect(published).toEqual([{ success: true, hash: 'successor' }]);
    client.terminate();
  });

  it('should settle a public render from terminal error state without diagnostics (T28)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture();
    await client.connect();
    await handlersReady;

    const render = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'error' });
    await expect(render).rejects.toThrow('Runtime render failed');
    client.terminate();
  });

  it('should scope a superseded command failure to its own admission (T41)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    await client.connect();
    await handlersReady;
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    /* The only way an admission can fail after a newer one has been admitted:
     * the wire dispatch throws once a superseding public render already owns
     * the pending promise. Admitting it from inside the throwing dispatch is
     * the deterministic stand-in for that interleaving. */
    const superseding: Array<Promise<unknown>> = [];
    notify.mockImplementationOnce(() => {
      superseding.push(client.render({ source: { path: 'live.ts' } }));
      throw new Error('wire dispatch failed');
    });

    const superseded = client.render({ source: { path: 'superseded.ts' } });
    await expect(superseded).resolves.toEqual({ superseded: true });
    expect(client.renderStatus).toBe('rendering');

    handlers.geometryComputed?.({ ...successGeometry('live'), renderId: renderIdFromNotify(notify, 1) });
    await expect(superseding[0]).resolves.toMatchObject({ superseded: false });
    expect(statuses).toEqual(['rendering', 'ready']);
    client.terminate();
  });

  it('should keep a connection-scoped error out of render settlement (T35)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture();
    const errors: string[] = [];
    client.on('error', (issues) => errors.push(...issues.map((issue) => issue.message)));
    await client.connect();
    await handlersReady;

    const render = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    handlers.errorEvent?.({ issues: [{ message: 'watch routing failed', code: 'RUNTIME', severity: 'error' }] });

    // A macrotask sentinel loses to any settled promise, so 'unsettled' is decisive.
    const settlement = await Promise.race([
      render.then(
        () => 'settled',
        () => 'settled',
      ),
      nextTask().then(() => 'unsettled'),
    ]);
    expect({ errors, settlement }).toEqual({ errors: ['watch routing failed'], settlement: 'unsettled' });

    handlers.geometryComputed?.({ ...successGeometry('recovered'), renderId });
    await expect(render).resolves.toMatchObject({ superseded: false });
    client.terminate();
  });

  it('maps unexpected non-timeout transport closure to transport-closed', async () => {
    const { client, closeTransport } = createStatusClientFixture();
    await client.connect();
    const render = client.render({ source: { path: 'pending.ts' } });
    const termination = expect(render).rejects.toMatchObject({
      name: 'RuntimeTerminatedError',
      causeKind: 'transport-closed',
    });

    closeTransport({ cause: 'host-exit', exitCode: 1 });

    await termination;
    expect(client.lifecycleState).toBe('terminated');
  });

  it('logs the host exit code before tearing down', async () => {
    const { client, closeTransport } = createStatusClientFixture();
    const entries: Array<{ level: string; message: string }> = [];
    client.on('log', (entry) => entries.push({ level: entry.level, message: entry.message }));
    await client.connect();

    closeTransport({ cause: 'host-exit', exitCode: 9 });
    await nextTask();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.message).toContain('9');
    expect(client.lifecycleState).toBe('terminated');
  });

  it('discards every late render-scoped frame from a superseded preview', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const states: WorkerState[] = [];
    const phases: string[] = [];
    const parameterFrames: unknown[] = [];
    const errors: string[] = [];
    const geometryHashes: string[] = [];
    const kernelIds: Array<string | undefined> = [];
    client.on('state', (state) => states.push(state));
    client.on('progress', (phase) => phases.push(phase));
    client.on('parametersResolved', (result) => parameterFrames.push(result));
    client.on('error', (issues) => errors.push(...issues.map((issue) => issue.code)));
    client.on('activeKernelChanged', (kernelId) => kernelIds.push(kernelId));
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });
    await client.connect();

    const first = client.render({ source: { path: 'first.ts' } });
    await Promise.resolve();
    const firstRenderId = renderIdFromNotify(notify, 0);
    const second = client.render({ source: { path: 'second.ts' } });
    await Promise.resolve();
    const secondRenderId = renderIdFromNotify(notify, 1);
    await expect(first).resolves.toEqual({ superseded: true });

    handlers.stateChanged?.({ renderId: firstRenderId, abortGeneration: 1, state: 'error' });
    handlers.progress?.({ renderId: firstRenderId, phase: 'computingGeometry' });
    handlers.parametersResolved?.({
      renderId: firstRenderId,
      result: {
        success: true,
        data: { defaultParameters: { stale: true }, jsonSchema: { type: 'object' } },
        issues: [],
      },
    });
    handlers.errorEvent?.({
      renderId: firstRenderId,
      issues: [{ message: 'stale failure', code: 'RUNTIME', severity: 'error' }],
    });
    handlers.activeKernelChanged?.({ renderId: firstRenderId, kernelId: 'stale-kernel' });
    handlers.geometryComputed?.({ ...successGeometry('stale'), renderId: firstRenderId });
    await nextTask();

    expect(states).toEqual([]);
    expect(phases).toEqual([]);
    expect(parameterFrames).toEqual([]);
    expect(errors).toEqual([]);
    expect(kernelIds).toEqual([]);
    expect(geometryHashes).toEqual([]);

    handlers.geometryComputed?.({ ...successGeometry('current'), renderId: secondRenderId });
    await expect(second).resolves.toMatchObject({ superseded: false });
    expect(geometryHashes).toEqual(['current']);
    client.terminate();
  });

  it('should discard geometry that becomes stale during asynchronous materialization (T21)', async () => {
    const firstResolution = Promise.withResolvers<void>();
    let resolutionCount = 0;
    const { client, handlers, notify } = createStatusClientFixture({
      resolveGeometry: async (geometry) => {
        resolutionCount++;
        if (resolutionCount === 1) {
          await firstResolution.promise;
        }
        if (geometry.format !== 'gltf' || geometry.content.delivery !== 'inline') {
          throw new Error('Expected inline GLTF geometry');
        }
        return { format: 'gltf', content: geometry.content.bytes, hash: geometry.hash };
      },
    });
    const geometryHashes: string[] = [];
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });
    await client.connect();

    const initialRender = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const initialRenderId = renderIdFromNotify(notify, 0);
    const watcherRenderId = '550e8400-e29b-41d4-a716-446655440098';

    handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('stale-after-resolution'), renderId: initialRenderId });
    handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'idle' });
    handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'buffering' });
    await expect(initialRender).resolves.toEqual({ superseded: true });

    firstResolution.resolve();
    await nextTask();
    expect(geometryHashes).toEqual([]);

    handlers.geometryComputed?.({ ...successGeometry('selected'), renderId: watcherRenderId });
    await nextTask();
    expect(geometryHashes).toEqual(['selected']);
    client.terminate();
  });

  it('should publish a watcher rerender that supersedes an unsettled client render', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const geometryHashes: string[] = [];
    const unsettled = Symbol('unsettled');
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });
    await client.connect();

    const initialRender = client.render({ source: { path: 'main.scad' } });
    await Promise.resolve();
    const initialRenderId = renderIdFromNotify(notify, 0);
    const watcherRenderId = '550e8400-e29b-41d4-a716-446655440099';

    try {
      handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'rendering' });
      // The worker reserves watcher render B immediately, but its FIFO lets
      // aborted render A report idle before routing B into buffering.
      handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'idle' });
      handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'buffering' });
      handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'rendering' });
      handlers.geometryComputed?.({
        ...successGeometry('watcher-rerender'),
        renderId: watcherRenderId,
      });
      handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'idle' });
      await nextTask();
      const initialSettlement = await Promise.race([initialRender, Promise.resolve(unsettled)]);

      expect({
        geometryHashes,
        initialSettlement: initialSettlement === unsettled ? 'unsettled' : initialSettlement,
        renderStatus: client.renderStatus,
      }).toEqual({
        geometryHashes: ['watcher-rerender'],
        initialSettlement: { superseded: true },
        renderStatus: 'ready',
      });
    } finally {
      client.terminate();
      await Promise.allSettled([initialRender]);
    }
  });

  it('should settle a stale SAB command whose successor already completed (T30)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture();
    const unsettled = Symbol('unsettled');
    await client.connect();
    await handlersReady;

    const delayedRender = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const staleRenderId = renderIdFromNotify(notify, 0);
    const successorRenderId = '550e8400-e29b-41d4-a716-446655440030';

    // The autonomous successor runs to completion while the stale command is
    // still the selected, unsettled preview, so every successor frame is
    // dropped and only the stale terminal `idle` ever reaches the client.
    handlers.stateChanged?.({ renderId: successorRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: successorRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('successor'), renderId: successorRenderId });
    handlers.stateChanged?.({ renderId: successorRenderId, abortGeneration: 2, state: 'idle' });
    handlers.stateChanged?.({ renderId: staleRenderId, abortGeneration: 1, state: 'idle' });
    await nextTask();

    const settlement = await Promise.race([delayedRender, Promise.resolve(unsettled)]);
    expect({
      settlement: settlement === unsettled ? 'unsettled' : settlement,
      renderStatus: client.renderStatus,
    }).toEqual({ settlement: { superseded: true }, renderStatus: 'idle' });
    client.terminate();
  });

  it('should reject non-record command inputs before admission (T33)', async () => {
    const { client, handlers, handlersReady, notify, reservePreview } = createStatusClientFixture();
    await client.connect();
    await handlersReady;

    const valid = client.render({ source: { path: 'valid.ts' } });
    await Promise.resolve();
    const validRenderId = renderIdFromNotify(notify, 0);
    reservePreview.mockClear();

    await expect(
      // @ts-expect-error -- deliberately exercises the runtime guard against a non-record parameters input
      client.render({ source: { path: 'main.ts' }, parameters: 'nope' }),
    ).rejects.toThrow(TypeError);
    await expect(
      client.render({
        source: { path: 'main.ts' },
        renderOptions: 'nope' as unknown as Record<string, unknown>,
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      // @ts-expect-error -- deliberately exercises the runtime guard against a non-record content input
      client.render({ source: { path: 'main.ts' }, content: 'nope' }),
    ).rejects.toThrow(TypeError);
    await expect(client.setOptions('nope' as unknown as Record<string, unknown>)).rejects.toThrow(TypeError);

    expect(reservePreview).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();

    handlers.geometryComputed?.({ ...successGeometry('valid'), renderId: validRenderId });
    await expect(valid).resolves.toMatchObject({ superseded: false });
    client.terminate();
  });

  it('should settle the selection when a dispatch fails after admission (T32)', async () => {
    const { client, handlers, handlersReady, notify } = createStatusClientFixture();
    const geometryHashes: string[] = [];
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });
    await client.connect();
    await handlersReady;

    /* Post-admission failure that is NOT a connection failure, so only the
     * catch-site settlement can un-fence adoption on this already-wired client. */
    notify.mockImplementationOnce(() => {
      throw new Error('wire dispatch failed');
    });
    await expect(client.render({ source: { path: 'main.ts' } })).rejects.toThrow('wire dispatch failed');

    const autonomousRenderId = '550e8400-e29b-41d4-a716-446655440033';
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('autonomous'), renderId: autonomousRenderId });
    await nextTask();

    expect(geometryHashes).toEqual(['autonomous']);
    client.terminate();
  });

  it('should settle the selection when a command fails after admission (T32)', async () => {
    let attempts = 0;
    const { client, handlers, notify } = createStatusClientFixture({
      initialize: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('transport initialize failed');
        }
        return { capabilities: { registrations: [], routes: [], renderCapabilities: {} } };
      },
    });
    const geometryHashes: string[] = [];
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });

    await expect(client.render({ source: { path: 'main.ts' } })).rejects.toThrow('transport initialize failed');
    expect(notify).not.toHaveBeenCalled();
    await client.connect();

    const autonomousRenderId = '550e8400-e29b-41d4-a716-446655440032';
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({ ...successGeometry('autonomous'), renderId: autonomousRenderId });
    await nextTask();

    expect(geometryHashes).toEqual(['autonomous']);
    client.terminate();
  });

  it('should adopt an autonomous successor after a stale SAB command terminates (T11)', async () => {
    const { client, handlers, notify } = createStatusClientFixture();
    const geometryHashes: string[] = [];
    client.on('geometry', (result) => {
      if (result.success) {
        geometryHashes.push(result.data.hash);
      }
    });
    await client.connect();

    const delayedRender = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const delayedRenderId = renderIdFromNotify(notify, 0);
    const autonomousRenderId = '550e8400-e29b-41d4-a716-446655440098';

    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: delayedRenderId, abortGeneration: 1, state: 'idle' });
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'rendering' });
    handlers.geometryComputed?.({
      ...successGeometry('autonomous-successor'),
      renderId: autonomousRenderId,
    });
    handlers.stateChanged?.({ renderId: autonomousRenderId, abortGeneration: 2, state: 'idle' });

    await expect(delayedRender).resolves.toEqual({ superseded: true });
    expect(geometryHashes).toEqual(['autonomous-successor']);
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('should surface one timeout for a selected autonomous preview without a public promise', async () => {
    const { client, handlers, notify, abort, terminateHost } = createStatusClientFixture({ renderTimeout: 100 });
    const errors: string[] = [];
    client.on('error', (issues) => errors.push(...issues.map((issue) => issue.code)));
    await client.connect();
    vi.useFakeTimers();

    const initialRender = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const initialRenderId = renderIdFromNotify(notify, 0);
    const watcherRenderId = '550e8400-e29b-41d4-a716-446655440097';

    handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'rendering' });
    handlers.stateChanged?.({ renderId: initialRenderId, abortGeneration: 1, state: 'idle' });
    handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'buffering' });
    handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'rendering' });
    await expect(initialRender).resolves.toEqual({ superseded: true });

    abort.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    expect(errors).toEqual(['RENDER_TIMEOUT']);
    expect(abort).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ renderId: watcherRenderId }));
    expect(client.renderStatus).toBe('error');

    handlers.errorEvent?.({
      renderId: watcherRenderId,
      issues: [{ message: 'render timed out', code: 'RENDER_TIMEOUT', severity: 'error' }],
    });
    handlers.stateChanged?.({ renderId: watcherRenderId, abortGeneration: 2, state: 'error' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(errors).toEqual(['RENDER_TIMEOUT']);
    expect(terminateHost).not.toHaveBeenCalled();
    client.terminate();
  });

  it('disables timeout enforcement for later renders when set to zero', async () => {
    const { client, handlers, notify, abort } = createStatusClientFixture({ renderTimeout: 100 });
    await client.connect();
    client.setRenderTimeout(0);
    vi.useFakeTimers();

    const settlement = client.render({ source: { path: 'main.ts' } });
    await Promise.resolve();
    const renderId = renderIdFromNotify(notify, 0);
    abort.mockClear();
    handlers.stateChanged?.({ renderId, abortGeneration: 1, state: 'rendering' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(abort).not.toHaveBeenCalled();
    handlers.geometryComputed?.({ ...successGeometry('timeout-disabled'), renderId });
    await settlement;

    client.terminate();
  });

  it('keeps setOptions render-affecting', async () => {
    const { client, handlers, notify, abort } = createStatusClientFixture();
    await client.connect();
    notify.mockClear();
    abort.mockClear();

    const settlement = client.setOptions({});
    await Promise.resolve();

    expect(abort).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledExactlyOnceWith('setOptions', expect.objectContaining({ options: {} }));
    const renderId = renderIdFromNotify(notify, 0);
    handlers.geometryComputed?.({ ...successGeometry('options-render'), renderId });
    await expect(settlement).resolves.toMatchObject({ superseded: false });

    client.terminate();
  });
});
