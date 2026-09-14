// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Channel } from '@taucad/rpc';
import { createRuntimeClient } from '#client/runtime-client-core.js';
import { compileParameterManifest } from '#parameter/manifest.js';
import type { ParameterManifest } from '#parameter/manifest.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient, TransportPlugin } from '#transport/runtime-transport.types.js';

const manifest = async (mode: 'default' | 'declared-only') =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
      },
      defaults: {},
    },
    scope: { kind: 'source', authority: 'test', root: '', entry: 'main.ts' },
    source: {
      id: 'test',
      version: '1',
      revision: 'source',
      capability: 'json-structure',
    },
    dependency: `sha256:${'1'.repeat(64)}`,
    middleware: `sha256:${'2'.repeat(64)}`,
    resolution: { mode },
  });

const fixture = async (defer = false, invalid = false) => {
  const entered = Promise.withResolvers<void>();
  const defaultManifest = await manifest('default');
  const declaredManifest = await manifest('declared-only');
  const resolveParameters = vi.fn(async (args: RuntimeProtocol['calls']['resolveParameters']['args']) => {
    entered.resolve();
    if (defer) {
      return new Promise<never>(() => {
        // The fixture settles through cancellation or client termination.
      });
    }
    return {
      success: true,
      data: invalid
        ? ({
            ...defaultManifest,
            profile: 'invalid-profile',
          } as unknown as ParameterManifest)
        : args.resolution?.mode === 'declared-only'
          ? declaredManifest
          : defaultManifest,
      issues: [],
    } as const;
  });
  const call = vi.fn(async (name: string, args: unknown, signal?: AbortSignal) => {
    if (name !== 'resolveParameters') {
      throw new Error(`Unexpected RPC call: ${name}`);
    }
    signal?.throwIfAborted();
    const aborted = new Promise<never>((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    return Promise.race([resolveParameters(args as RuntimeProtocol['calls']['resolveParameters']['args']), aborted]);
  });
  const transportClosed = Promise.withResolvers<Awaited<RuntimeTransportClient['closed']>>();
  const channel = {
    ready: Promise.resolve(),
    closed: new Promise(() => {
      // The transport remains open for the fixture lifetime.
    }),
    hello: {
      payload: {
        server: 'kernel-runtime-worker',
        runtimeVersion: 'test',
        protocolVersion,
      },
    },
    onNotify: vi.fn(() => () => undefined),
    notify: vi.fn(),
    call,
    close: vi.fn(),
    onClose: vi.fn(() => () => undefined),
  } as unknown as Channel<RuntimeProtocol>;
  const transport: RuntimeTransportClient = {
    id: 'parameter-test',
    closed: transportClosed.promise,
    reservePreview: vi.fn(() => ({})),
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'parameter-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize: vi.fn(async () => ({
      capabilities: { registrations: [], routes: [], renderCapabilities: {} },
    })),
    resolveGeometry: vi.fn(),
    close: vi.fn(async () => {
      // No external resource is owned by this fixture.
    }),
  };
  const plugin: TransportPlugin = {
    id: 'parameter-test',
    describe: transport.describe,
    materialize: () => transport,
  };
  return {
    client: createRuntimeClient({ transport: plugin }),
    resolveParameters,
    entered: entered.promise,
  };
};

describe('RuntimeClient.resolveParameters', () => {
  it('resolves default and declared-only manifests without selecting a preview', async () => {
    const { client, resolveParameters } = await fixture();

    await expect(client.resolveParameters({ source: { files: { 'main.ts': 'model' } } })).resolves.toMatchObject({
      success: true,
      data: { identity: { resolution: { mode: 'default' } } },
    });
    await expect(
      client.resolveParameters({
        source: { path: 'main.ts' },
        resolution: { mode: 'declared-only' },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { identity: { resolution: { mode: 'declared-only' } } },
    });
    expect(resolveParameters).toHaveBeenNthCalledWith(1, {
      stage: { 'main.ts': new TextEncoder().encode('model') },
      file: { path: '', filename: 'main.ts' },
    });
    expect(resolveParameters).toHaveBeenNthCalledWith(2, {
      file: { path: '', filename: 'main.ts' },
      resolution: { mode: 'declared-only' },
    });
  });

  it('aborts an entered request and rejects a pending request on termination', async () => {
    const aborted = await fixture(true);
    const controller = new AbortController();
    const pending = aborted.client.resolveParameters({
      source: { path: 'main.ts' },
      signal: controller.signal,
    });
    await aborted.entered;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    const terminated = await fixture(true);
    const unresolved = terminated.client.resolveParameters({
      source: { path: 'main.ts' },
    });
    await terminated.entered;
    terminated.client.terminate();
    await expect(unresolved).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
    });
  });

  it('preserves exact admission diagnostics on a malformed transported manifest', async () => {
    const malformed = await fixture(false, true);

    await expect(malformed.client.resolveParameters({ source: { path: 'main.ts' } })).resolves.toMatchObject({
      success: false,
      issues: [
        {
          details: [
            {
              code: 'INVALID_SCHEMA',
              resource: 'urn:taucad:parameter-schema:root',
              schemaPointer: '',
            },
          ],
        },
      ],
    });
  });
});
