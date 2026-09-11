// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { z } from 'zod';

import { createRuntimeClient } from '#client/runtime-client-core.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type { GeometryTransport, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient, TransportPlugin } from '#transport/runtime-transport.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const geometry: GeometryTransport = {
  format: 'gltf',
  hash: 'evaluation',
  content: { delivery: 'inline', bytes: new Uint8Array([1, 2, 3]) },
};

const runtime = defineRuntime({ configSchema: z.undefined(), createRuntime: () => ({}) });

const fixture = (
  options: {
    deferFirst?: boolean;
    deferAll?: boolean;
    connectionGate?: Promise<void>;
    config?: () => undefined | Promise<undefined>;
  } = {},
) => {
  let calls = 0;
  const entered = Promise.withResolvers<void>();
  const evaluate = vi.fn(async (_args: RuntimeProtocol['calls']['evaluateModel']['args']) => {
    calls += 1;
    entered.resolve();
    if (options.deferAll === true || (options.deferFirst === true && calls === 1)) {
      return new Promise<never>(() => {
        // Termination settles the public client promise independently.
      });
    }
    return { success: true, data: geometry, issues: [] } as const;
  });
  const reservePreview = vi.fn(() => ({}));
  const call = vi.fn(async (name: string, args: unknown, signal?: AbortSignal) => {
    if (name !== 'evaluateModel') {
      throw new Error(`Unexpected RPC call: ${name}`);
    }
    signal?.throwIfAborted();
    const abort = new Promise<never>((_resolve, reject) => {
      const rejectAbort = (): void => {
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', rejectAbort, { once: true });
    });
    return Promise.race([evaluate(args as RuntimeProtocol['calls']['evaluateModel']['args']), abort]);
  });
  const channel = {
    ready: Promise.resolve(),
    closed: new Promise(() => {
      // The transport remains open for the fixture lifetime.
    }),
    port: { postMessage: vi.fn(), onMessage: vi.fn(() => () => undefined), close: vi.fn() },
    hello: { payload: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion } },
    onNotify: vi.fn(() => () => undefined),
    notify: vi.fn(),
    call,
    listen: vi.fn(() => {
      throw new Error('Unexpected RPC listen');
    }),
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  } as unknown as Channel<RuntimeProtocol>;
  const transportClosed = Promise.withResolvers<Awaited<RuntimeTransportClient['closed']>>();
  const transport: RuntimeTransportClient = {
    id: 'evaluation-test',
    closed: transportClosed.promise,
    reservePreview,
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'evaluation-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize: vi.fn(async () => {
      await options.connectionGate;
      return { capabilities: { registrations: [], routes: [], renderCapabilities: {} } };
    }),
    resolveGeometry: vi.fn(async (value: GeometryTransport): Promise<Geometry> => {
      if (value.format !== 'gltf' || value.content.delivery !== 'inline') {
        throw new Error('Fixture expected inline GLTF geometry.');
      }
      return { format: 'gltf', hash: value.hash, content: value.content.bytes };
    }),
    close: vi.fn(async () => {
      // No external transport resource is owned by this fixture.
    }),
  };
  const plugin: TransportPlugin<RuntimeProtocol, Readonly<Record<never, never>>, string, typeof runtime> = {
    id: 'evaluation-test',
    describe: transport.describe,
    materialize: () => transport,
  };
  return {
    client: createRuntimeClient({
      transport: plugin,
      ...(options.config === undefined ? {} : { config: options.config }),
    }),
    entered: entered.promise,
    evaluate,
    reservePreview,
    transport,
    closeTransport: () => {
      transportClosed.resolve({ cause: 'host-exit', phase: 'session' });
    },
  };
};

describe('RuntimeClient.evaluate', () => {
  it('rejects a pre-aborted request without starting connection', async () => {
    const preAborted = fixture();
    const controller = new AbortController();
    controller.abort();

    await expect(
      preAborted.client.evaluate({ source: { files: { 'main.ts': 'model' } }, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(preAborted.transport.open).not.toHaveBeenCalled();
  });

  it('normalizes source, connects lazily, and does not admit or publish a preview', async () => {
    const { client, evaluate, reservePreview, transport } = fixture();
    const observed: unknown[] = [];
    client.on('geometry', (value) => observed.push(value));

    await expect(
      client.evaluate({
        source: { files: { 'main.ts': 'model', 'lib.ts': new Uint8Array([9]) }, entry: 'main.ts' },
        parameters: { width: 2 },
        renderOptions: { quality: 'draft' },
      }),
    ).resolves.toMatchObject({ success: true, data: { hash: 'evaluation', content: new Uint8Array([1, 2, 3]) } });
    expect(transport.open).toHaveBeenCalledOnce();
    expect(reservePreview).not.toHaveBeenCalled();
    expect(observed).toEqual([]);
    expect(evaluate).toHaveBeenCalledWith({
      stage: { 'main.ts': new TextEncoder().encode('model'), 'lib.ts': new Uint8Array([9]) },
      file: { path: '', filename: 'main.ts' },
      parameters: { width: 2 },
      options: { quality: 'draft' },
    });
  });

  it('isolates per-request abort and rejects pending evaluation on termination', async () => {
    const abortedFixture = fixture({ deferFirst: true });
    const controller = new AbortController();
    const aborted = abortedFixture.client.evaluate({
      source: { files: { 'main.ts': 'model' } },
      signal: controller.signal,
    });
    await abortedFixture.entered;
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await expect(abortedFixture.client.evaluate({ source: { files: { 'main.ts': 'model' } } })).resolves.toMatchObject({
      success: true,
    });

    const terminatedFixture = fixture({ deferAll: true });
    const pending = terminatedFixture.client.evaluate({ source: { files: { 'main.ts': 'model' } } });
    await terminatedFixture.entered;
    terminatedFixture.client.terminate();
    await expect(pending).rejects.toMatchObject({ code: 'RUNTIME_TERMINATED' });
    await expect(
      terminatedFixture.client.evaluate({ source: { files: { 'main.ts': 'model' } } }),
    ).rejects.toMatchObject({ code: 'RUNTIME_TERMINATED' });
  });

  it('aborts only one wait for a shared stalled connection', async () => {
    const connection = Promise.withResolvers<void>();
    const shared = fixture({ connectionGate: connection.promise });
    const controller = new AbortController();
    const cancelled = shared.client.evaluate({
      source: { files: { 'cancelled.ts': 'model' } },
      signal: controller.signal,
    });
    const survivor = shared.client.evaluate({ source: { files: { 'survivor.ts': 'model' } } });
    controller.abort();

    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(shared.transport.open).toHaveBeenCalledOnce();
    connection.resolve();
    await expect(survivor).resolves.toMatchObject({ success: true });
    expect(shared.evaluate).toHaveBeenCalledOnce();
  });

  it('observes a started connection promise when config aborts then rejects', async () => {
    const controller = new AbortController();
    const connectionFailure = new Error('CONFIG_FAILED_AFTER_ABORT');
    const config = vi.fn(async () => {
      controller.abort();
      throw connectionFailure;
    });
    const failed = fixture({ config });

    await expect(
      failed.client.evaluate({ source: { files: { 'main.ts': 'model' } }, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => {
      expect(failed.client.lifecycleState).toBe('unconnected');
    });
    expect(config).toHaveBeenCalledOnce();
  });

  it('rejects an RPC-entered evaluation on transport closure and refuses future calls', async () => {
    const closed = fixture({ deferAll: true });
    const pending = closed.client.evaluate({ source: { files: { 'main.ts': 'model' } } });
    await closed.entered;
    closed.closeTransport();

    await expect(pending).rejects.toMatchObject({ code: 'RUNTIME_TERMINATED', causeKind: 'transport-closed' });
    await expect(closed.client.evaluate({ source: { files: { 'main.ts': 'model' } } })).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
    });
  });
});
