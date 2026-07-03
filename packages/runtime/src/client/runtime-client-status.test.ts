// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { createRuntimeClientWithTransport } from '#client/runtime-client-core.js';
import type { RenderStatus } from '#client/runtime-client-core.js';
import type { GeometryTransport, RuntimeProtocol, WorkerState } from '#types/runtime-protocol.types.js';
import type {
  RuntimeTransportClient,
  TransportClientReady,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';

type NotifyHandlers = {
  stateChanged?: (args: { readonly state: WorkerState; readonly detail?: string }) => void;
  geometryComputed?: (args: RuntimeProtocol['notifies']['geometryComputed']['args']) => void;
  errorEvent?: (args: RuntimeProtocol['notifies']['errorEvent']['args']) => void;
};

const successGeometry = (hash: string): RuntimeProtocol['notifies']['geometryComputed']['args'] => ({
  rgen: 1,
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

const failureGeometry = (): RuntimeProtocol['notifies']['geometryComputed']['args'] => ({
  rgen: 1,
  result: {
    success: false,
    issues: [{ message: 'bad model', code: 'RUNTIME', severity: 'error' }],
  },
});

function createStatusClientFixture(): {
  readonly client: ReturnType<typeof createRuntimeClientWithTransport>;
  readonly handlers: NotifyHandlers;
} {
  const handlers: NotifyHandlers = {};
  const hello = {
    server: 'kernel-runtime-worker',
    runtimeVersion: '0.0.0-test',
    transportId: 'status-test',
  } satisfies TransportClientReady['hello'];
  const channel: Channel<RuntimeProtocol> = {
    ready: Promise.resolve(),
    closed: Promise.resolve(),
    port: {
      postMessage: vi.fn(),
      onMessage: vi.fn(() => () => undefined),
      close: vi.fn(),
    },
    hello: { payload: {} },
    onNotify: vi.fn((name: keyof RuntimeProtocol['notifies'], handler: (args: never) => void) => {
      switch (name) {
        case 'stateChanged': {
          handlers.stateChanged = handler as NotifyHandlers['stateChanged'];
          break;
        }
        case 'geometryComputed': {
          handlers.geometryComputed = handler as NotifyHandlers['geometryComputed'];
          break;
        }
        case 'errorEvent': {
          handlers.errorEvent = handler as NotifyHandlers['errorEvent'];
          break;
        }
      }
      return () => undefined;
    }),
    notify: vi.fn(),
    call: vi.fn(async () => {
      throw new Error('Unexpected RPC call');
    }),
    listen: vi.fn(() => {
      throw new Error('Unexpected RPC listen');
    }),
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  };
  const transport: RuntimeTransportClient = {
    id: 'status-test',
    closed: Promise.resolve(),
    describe: () => ({
      id: 'status-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', fileDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel, hello })),
    initialize: vi.fn(async () => ({ capabilities: { routes: [], renderSchemas: {} } })),
    abort: vi.fn(),
    resolveGeometry: vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => {
      if (geometry.format !== 'gltf' || geometry.content.delivery !== 'inline') {
        throw new Error('Expected inline GLTF geometry');
      }
      return { format: 'gltf', content: geometry.content.bytes, hash: geometry.hash };
    }),
    close: vi.fn(async () => undefined),
  };
  const plugin: TransportPlugin = {
    id: 'status-test',
    describe: transport.describe,
    materialize: () => transport,
  };

  return { client: createRuntimeClientWithTransport({ transport: plugin }), handlers };
}

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
  it('should emit connecting, rendering, and ready for a successful render', async () => {
    const { client, handlers } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const settlement = client.render({ source: { path: '/main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    handlers.stateChanged?.({ state: 'buffering' });
    handlers.stateChanged?.({ state: 'rendering' });
    handlers.geometryComputed?.(successGeometry('h-1'));
    handlers.stateChanged?.({ state: 'idle' });

    await expect(settlement).resolves.toMatchObject({ superseded: false });
    expect(statuses).toEqual(['connecting', 'rendering', 'ready']);
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('should clear render failure on the next render and recover to ready', async () => {
    const { client, handlers } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const failed = client.render({ source: { path: '/main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    handlers.geometryComputed?.(failureGeometry());
    await expect(failed).resolves.toMatchObject({ superseded: false });
    expect(client.renderStatus).toBe('error');

    const recovered = client.render({ source: { path: '/main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    handlers.stateChanged?.({ state: 'rendering' });
    handlers.geometryComputed?.(successGeometry('h-2'));
    handlers.stateChanged?.({ state: 'idle' });

    await expect(recovered).resolves.toMatchObject({ superseded: false });
    expect(statuses).toContain('error');
    expect(statuses.slice(statuses.indexOf('error') + 1)).toEqual(['rendering', 'ready']);
    expect(client.renderStatus).toBe('ready');
    client.terminate();
  });

  it('should emit each derived status once until it changes', async () => {
    const { client, handlers } = createStatusClientFixture();
    const statuses: RenderStatus[] = [];
    client.on('renderStatus', (status) => {
      statuses.push(status);
    });

    const settlement = client.render({ source: { path: '/main.ts' } });
    await waitForRuntimeNotifyHandlers(handlers);
    handlers.stateChanged?.({ state: 'buffering' });
    handlers.stateChanged?.({ state: 'buffering' });
    handlers.stateChanged?.({ state: 'rendering' });
    handlers.geometryComputed?.(successGeometry('h-1'));
    handlers.stateChanged?.({ state: 'idle' });
    handlers.stateChanged?.({ state: 'idle' });

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
});
