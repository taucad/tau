// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { GeometryTransport, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type {
  RuntimeTransportCloseResult,
  TransportPlugin,
  RuntimeTransportClient,
} from '#transport/runtime-transport.types.js';
import { createRuntimeClient } from '#client/runtime-client-core.js';
import type { ExportResult } from '#client/runtime-client-core.js';
import { protocolVersion } from '#types/protocol-header.types.js';

const exportResult: ExportGeometryResult = {
  success: true,
  data: [
    {
      bytes: new Uint8Array([1, 2, 3]),
      name: 'model.glb',
      mimeType: 'model/gltf-binary',
    },
    {
      bytes: new Uint8Array([4, 5]),
      name: 'textures/base.png',
      mimeType: 'image/png',
    },
  ],
  issues: [],
};

/**
 * @param options - `deferExports` keeps both export calls in flight so a
 * mid-flight abort has something to cancel.
 */
function createFakeTransport(options?: { deferExports?: boolean }) {
  const stayPending = async (): Promise<ExportGeometryResult> =>
    new Promise<ExportGeometryResult>(() => {
      /* The deferred export stays in flight for the whole test. */
    });
  const exportCall = vi.fn(async (_format: string, _exportOptions?: Record<string, unknown>) =>
    options?.deferExports ? stayPending() : exportResult,
  );
  const exportModelCall = vi.fn(async (_request: RuntimeProtocol['calls']['exportModel']['args']) =>
    options?.deferExports ? stayPending() : exportResult,
  );
  const channel: Channel<RuntimeProtocol> = {
    ready: Promise.resolve(),
    closed: Promise.resolve(),
    port: {
      postMessage: vi.fn(),
      onMessage: vi.fn(() => () => undefined),
      close: vi.fn(),
    },
    hello: { payload: { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', protocolVersion } },
    onNotify: vi.fn(() => () => undefined),
    notify: vi.fn(),
    call: vi.fn(async (method: keyof RuntimeProtocol['calls'], args: unknown, signal?: AbortSignal) => {
      /* Mirrors the real channel (`libs/rpc/src/channel.ts:839-868`): a supplied
       * signal rejects the in-flight call with `DOMException(…, 'AbortError')`. */
      const abortRejection = new Promise<never>((_resolve, reject) => {
        const rejectAborted = (): void => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted) {
          rejectAborted();
          return;
        }
        signal?.addEventListener('abort', rejectAborted, { once: true });
      });
      if (method === 'export') {
        const request = args as { format: string; options?: Record<string, unknown> };
        return Promise.race([exportCall(request.format, request.options), abortRejection]);
      }
      if (method === 'exportModel') {
        return Promise.race([exportModelCall(args as RuntimeProtocol['calls']['exportModel']['args']), abortRejection]);
      }
      throw new Error(`Unexpected RPC call: ${String(method)}`);
    }),
    listen: vi.fn(() => {
      throw new Error('Unexpected RPC listen');
    }),
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  };

  let close: ((result: RuntimeTransportCloseResult) => void) | undefined;
  const transport: RuntimeTransportClient = {
    id: 'test-transport',
    closed: new Promise<RuntimeTransportCloseResult>((resolve) => {
      close = resolve;
    }),
    reservePreview: () => ({}),
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'test-transport',
      wire: 'in-process',
      memory: {
        geometryDelivery: 'copy',
        abortSignal: 'wire-notify',
      },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize: vi.fn(async () => ({
      capabilities: {
        registrations: [],
        routes: [],
        renderCapabilities: {},
      },
    })),
    resolveGeometry: vi.fn(async (geometry: GeometryTransport): Promise<Geometry> => geometry as unknown as Geometry),
    close: vi.fn(async () => {
      close?.({ cause: 'requested' });
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
  it('should export a file request without calling render', async () => {
    const { exportCall, exportModelCall, plugin } = createFakeTransport();
    const client = createRuntimeClient({
      transport: plugin,
    });
    const render = vi.fn();
    client.render = render;

    const result = await client.export('glb', {
      source: { path: 'lib/cube.ts' },
      parameters: { height: 10 },
      exportOptions: { binary: true },
    });

    expect(render).not.toHaveBeenCalled();
    expect(exportCall).not.toHaveBeenCalled();
    expect(exportModelCall).toHaveBeenCalledWith({
      file: { path: 'lib', filename: 'cube.ts' },
      parameters: { height: 10 },
      format: 'glb',
      exportOptions: { binary: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.map(({ name, mimeType, bytes }) => ({ name, mimeType, bytes: [...bytes] }))).toEqual([
        { name: 'model.glb', mimeType: 'model/gltf-binary', bytes: [1, 2, 3] },
        { name: 'textures/base.png', mimeType: 'image/png', bytes: [4, 5] },
      ]);
    }
    client.terminate();
  });

  it('should export inline code by staging source files in the request', async () => {
    const { exportModelCall, plugin } = createFakeTransport();
    const client = createRuntimeClient({
      transport: plugin,
    });
    const inlineCode: Record<string, string> = {};
    inlineCode['main.ts'] = 'export default function main() { return {}; }';
    inlineCode['lib/part.ts'] = 'export const part = {};';

    const result = await client.export('step', {
      source: { files: inlineCode, entry: 'main.ts' },
      parameters: { radius: 4 },
      exportOptions: { unit: 'mm' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.map(({ name }) => name)).toEqual(['model.glb', 'textures/base.png']);
    }
    expect(exportModelCall).toHaveBeenCalledOnce();
    const request = exportModelCall.mock.calls.at(0)?.[0];
    expect(request?.stage?.['main.ts']).toBeInstanceOf(Uint8Array);
    expect(request?.stage?.['lib/part.ts']).toBeInstanceOf(Uint8Array);
    expect(request).toMatchObject({
      file: { path: '', filename: 'main.ts' },
      parameters: { radius: 4 },
      format: 'step',
      exportOptions: { unit: 'mm' },
    });
    client.terminate();
  });

  it('should keep single-argument export behavior unchanged', async () => {
    const { plugin } = createFakeTransport();
    const client = createRuntimeClient({
      transport: plugin,
    });

    await expect(client.export('glb')).rejects.toMatchObject({ code: 'RUNTIME_NO_RENDER_OUTCOME' });
    client.terminate();
  });

  it('should not let request-scoped export create a settled preview export state', async () => {
    const { plugin } = createFakeTransport();
    const client = createRuntimeClient({
      transport: plugin,
    });

    await client.export('glb', { source: { path: 'main.ts' } });

    await expect(client.export('glb')).rejects.toMatchObject({ code: 'RUNTIME_NO_RENDER_OUTCOME' });
    client.terminate();
  });

  it('should reject unsupported top-level export keys', async () => {
    const { plugin } = createFakeTransport();
    const client = createRuntimeClient({
      transport: plugin,
    });
    const exportFromJavaScript = client.export as (
      format: string,
      options?: Record<string, unknown>,
    ) => Promise<ExportResult>;

    await expect(exportFromJavaScript('glb', { source: { path: 'main.ts' }, renderOptions: {} })).rejects.toThrow(
      'renderOptions',
    );
    await expect(exportFromJavaScript('glb', { unexpected: true })).rejects.toThrow('unexpected');
    // `signal` joined the allowlist with D6; a typo of it is still rejected.
    await expect(
      exportFromJavaScript('glb', { source: { path: 'main.ts' }, signal: undefined }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      exportFromJavaScript('glb', { source: { path: 'main.ts' }, singal: new AbortController().signal }),
    ).rejects.toThrow('singal');
    client.terminate();
  });

  it('rejects an aborted export with the abort error', async () => {
    const { channel, plugin } = createFakeTransport({ deferExports: true });
    const client = createRuntimeClient({
      transport: plugin,
    });
    const controller = new AbortController();

    const settled = client.export('glb', { source: { path: 'main.ts' }, signal: controller.signal });
    await vi.waitFor(() => {
      expect(channel.call).toHaveBeenCalledWith('exportModel', expect.anything(), controller.signal);
    });
    controller.abort();

    await expect(settled).rejects.toMatchObject({ name: 'AbortError' });
    client.terminate();
  });
});
