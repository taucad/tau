// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { GeometryTransport, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type {
  TransportPlugin,
  RuntimeTransportClient,
  TransportClientReady,
} from '#transport/runtime-transport.types.js';
import { createRuntimeClientWithTransport } from '#client/runtime-client-core.js';

const exportResult: ExportGeometryResult = {
  success: true,
  data: [
    {
      bytes: new Uint8Array([1, 2, 3]),
      name: 'model.glb',
      mimeType: 'model/gltf-binary',
    },
  ],
  issues: [],
};

function createFakeTransport() {
  const exportCall = vi.fn(async (_format: string, _options?: Record<string, unknown>) => exportResult);
  const exportModelCall = vi.fn(async (_request: RuntimeProtocol['calls']['exportModel']['args']) => exportResult);
  const hello = {
    server: 'kernel-runtime-worker',
    runtimeVersion: '0.0.0-test',
    transportId: 'test-transport',
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
    onNotify: vi.fn(() => () => undefined),
    notify: vi.fn(),
    call: vi.fn(async (method: keyof RuntimeProtocol['calls'], args: unknown) => {
      if (method === 'export') {
        const request = args as { format: string; options?: Record<string, unknown> };
        return exportCall(request.format, request.options);
      }
      if (method === 'exportModel') {
        return exportModelCall(args as RuntimeProtocol['calls']['exportModel']['args']);
      }
      throw new Error(`Unexpected RPC call: ${String(method)}`);
    }),
    listen: vi.fn(() => {
      throw new Error('Unexpected RPC listen');
    }),
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  };

  let close: (() => void) | undefined;
  const transport: RuntimeTransportClient = {
    id: 'test-transport',
    closed: new Promise<void>((resolve) => {
      close = resolve;
    }),
    describe: () => ({
      id: 'test-transport',
      wire: 'in-process',
      memory: {
        geometryDelivery: 'copy',
        fileDelivery: 'copy',
        abortSignal: 'wire-notify',
      },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({
      channel,
      hello,
    })),
    initialize: vi.fn(async () => ({
      capabilities: {
        routes: [],
        renderSchemas: {},
      },
    })),
    abort: vi.fn(),
    resolveGeometry: vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => geometry as unknown as Geometry),
    close: vi.fn(async () => {
      close?.();
    }),
  };

  const plugin: TransportPlugin = {
    id: 'test-transport',
    describe: transport.describe,
    materialize: () => transport,
  };

  return { channel, exportCall, exportModelCall, plugin, transport };
}

describe('RuntimeClient request-scoped export', () => {
  it('should export a file request without calling openFile', async () => {
    const { exportCall, exportModelCall, plugin } = createFakeTransport();
    const client = createRuntimeClientWithTransport({
      transport: plugin,
    });
    const openFile = vi.fn();
    client.openFile = openFile;

    const result = await client.export('glb', {
      file: 'main.ts',
      parameters: { height: 10 },
      options: { quality: 'fine' },
      binary: true,
    });

    expect(openFile).not.toHaveBeenCalled();
    expect(exportCall).not.toHaveBeenCalled();
    expect(exportModelCall).toHaveBeenCalledWith({
      file: { path: '/', filename: 'main.ts' },
      parameters: { height: 10 },
      options: { quality: 'fine' },
      format: 'glb',
      exportOptions: { binary: true },
    });
    expect(result.success).toBe(true);
    client.terminate();
  });

  it('should export inline code by staging source files in the request', async () => {
    const { exportModelCall, plugin } = createFakeTransport();
    const client = createRuntimeClientWithTransport({
      transport: plugin,
    });
    const inlineCode: Record<string, string> = {};
    inlineCode['main.ts'] = 'export default function main() { return {}; }';
    inlineCode['lib/part.ts'] = 'export const part = {};';

    const result = await client.export('step', {
      code: inlineCode,
      file: 'main.ts',
      parameters: { radius: 4 },
      unit: 'mm',
    });

    expect(result.success).toBe(true);
    expect(exportModelCall).toHaveBeenCalledOnce();
    const request = exportModelCall.mock.calls.at(0)?.[0];
    expect(request?.stage?.['/main.ts']).toBeInstanceOf(Uint8Array);
    expect(request?.stage?.['/lib/part.ts']).toBeInstanceOf(Uint8Array);
    expect(request).toMatchObject({
      file: { path: '/', filename: 'main.ts' },
      parameters: { radius: 4 },
      format: 'step',
      exportOptions: { unit: 'mm' },
    });
    client.terminate();
  });

  it('should keep single-argument export behavior unchanged', async () => {
    const { plugin } = createFakeTransport();
    const client = createRuntimeClientWithTransport({
      transport: plugin,
    });

    await expect(client.export('glb')).rejects.toMatchObject({ code: 'RUNTIME_NO_RENDER_OUTCOME' });
    client.terminate();
  });

  it('should not let request-scoped export create a settled preview export state', async () => {
    const { plugin } = createFakeTransport();
    const client = createRuntimeClientWithTransport({
      transport: plugin,
    });

    await client.export('glb', { file: 'main.ts' });

    await expect(client.export('glb')).rejects.toMatchObject({ code: 'RUNTIME_NO_RENDER_OUTCOME' });
    client.terminate();
  });
});
