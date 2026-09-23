// @vitest-environment node
import { contentDigest } from '@taucad/cache-core';
import type { Channel } from '@taucad/rpc';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';
import { admitParameterManifest, compileParameterManifest } from '@taucad/parameters';
import type * as ParametersModule from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import { protocolVersion } from '#types/protocol-header.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';

type NotifyHandler = (args: unknown) => void;

// Admission canonically recompiles exactly once; count that public boundary without reaching into manifest internals.
const compileManifestSpy = vi.hoisted(() => vi.fn());

vi.mock('@taucad/parameters', async (importOriginal) => {
  const actual = await importOriginal<typeof ParametersModule>();
  return {
    ...actual,
    admitParameterManifest: async (...args: Parameters<typeof actual.admitParameterManifest>) => {
      compileManifestSpy();
      return actual.admitParameterManifest(...args);
    },
  };
});

const compileManifest = async (): Promise<ParameterManifest> =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:taucad:test:client-parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'ClientParameters',
        type: 'object',
        properties: {
          length: { type: 'double', ucumUnit: 'mm', minimum: 0 },
        },
        required: ['length'],
      },
      defaults: { length: 2 },
    },
    scope: {
      kind: 'source',
      authority: 'filesystem',
      root: '/project',
      entry: '/project/main.ts',
    },
    source: {
      id: 'test-kernel',
      version: '1.0.0',
      revision: 'test-source',
      capability: 'json-structure',
    },
    dependency: contentDigest({ value: `sha256:${'1'.repeat(64)}` }),
    middleware: contentDigest({ value: `sha256:${'2'.repeat(64)}` }),
  });

const createFixture = async () => {
  const handlers = new Map<string, NotifyHandler>();
  const call = vi.fn(async (): Promise<unknown> => undefined);
  const channel = {
    ready: Promise.resolve(),
    hello: {
      payload: { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', protocolVersion },
    },
    onNotify: vi.fn((name: string, handler: NotifyHandler) => {
      handlers.set(name, handler);
      return () => {
        handlers.delete(name);
      };
    }),
    call,
  } as unknown as Channel<RuntimeProtocol>;
  const transport: RuntimeTransportClient = {
    id: 'parameters-test',
    closed: new Promise<never>(() => {
      // Intentionally pending for the fixture lifetime.
    }),
    reservePreview: () => ({}),
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'parameters-test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize: vi.fn(async () => ({ capabilities: { registrations: [], routes: [], renderCapabilities: {} } })),
    resolveGeometry: vi.fn(),
    close: vi.fn(),
  };
  const client = new RuntimeWorkerClient({ transport });
  await client.initialize();
  const notifyParameters = (args: RuntimeProtocol['notifies']['parametersResolved']['args']): void => {
    handlers.get('parametersResolved')?.(args);
  };
  return { call, client, notifyParameters };
};

describe('RuntimeWorkerClient parameter notifications', () => {
  it('should return the held manifest for a repeated revision without recompiling', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    fixture.call.mockResolvedValue({ success: true, data: manifest, issues: [] });
    compileManifestSpy.mockClear();

    const first = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });
    const second = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });

    if (!first.success || !second.success) {
      expect.fail('both admissions should succeed');
    }
    expect(second.data).toBe(first.data);
    expect(compileManifestSpy).toHaveBeenCalledOnce();
    fixture.client.terminate();
  });

  it('should ignore a tampered body under a held revision', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const tampered = { ...manifest, defaults: { length: 999 } };
    fixture.call
      .mockResolvedValueOnce({ success: true, data: manifest, issues: [] })
      .mockResolvedValueOnce({ success: true, data: tampered, issues: [] });

    const first = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });
    const second = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });

    if (!first.success || !second.success) {
      expect.fail('both admissions should succeed');
    }
    expect(second.data).toBe(first.data);
    fixture.client.terminate();
  });

  it('should not cache a rejected admission', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const tampered = { ...manifest, defaults: { length: 999 } };
    fixture.call
      .mockResolvedValueOnce({ success: true, data: tampered, issues: [] })
      .mockResolvedValueOnce({ success: true, data: manifest, issues: [] });

    const rejected = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });
    const accepted = await fixture.client.resolveParameters({ file: { path: '', filename: 'main.ts' } });

    expect(rejected.success).toBe(false);
    expect(accepted).toMatchObject({ success: true, data: manifest });
    fixture.client.terminate();
  });

  it('should canonically admit valid manifests before publishing them', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const { renderId } = fixture.client.admitPreview();
    const published = Promise.withResolvers<RuntimeProtocol['notifies']['parametersResolved']['args']>();
    fixture.client.onParametersResolved(published.resolve);

    fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId });

    const event = await published.promise;
    expect(event.result).toMatchObject({ success: true, data: manifest });
    expect(event.result.success && Object.isFrozen(event.result.data)).toBe(true);
    fixture.client.terminate();
  });

  it('should publish a typed failure for a stale manifest revision', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const stale = { ...manifest, revision: contentDigest({ value: `sha256:${'3'.repeat(64)}` }) };
    const { renderId } = fixture.client.admitPreview();
    const published = Promise.withResolvers<RuntimeProtocol['notifies']['parametersResolved']['args']>();
    fixture.client.onParametersResolved(published.resolve);

    fixture.notifyParameters({ result: { success: true, data: stale, issues: [] }, renderId });

    const event = await published.promise;
    expect(event.result).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'METADATA_CONFLICT',
          type: 'runtime',
          severity: 'error',
          details: [expect.objectContaining({ code: 'METADATA_CONFLICT', schemaPointer: '/revision' })],
        }),
      ],
    });
    fixture.client.terminate();
  });

  it('should suppress an older notification when a newer preview is selected during admission', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const older = fixture.client.admitPreview();
    const seen: string[] = [];
    const published = Promise.withResolvers<void>();
    fixture.client.onParametersResolved(({ renderId }) => {
      seen.push(renderId);
      published.resolve();
    });

    fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId: older.renderId });
    await Promise.resolve();
    const newer = fixture.client.admitPreview();
    fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId: newer.renderId });

    await published.promise;
    expect(seen).toEqual([newer.renderId]);
    fixture.client.terminate();
  });

  it('should suppress a callback when unsubscribed during admission', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const { renderId } = fixture.client.admitPreview();
    const handler = vi.fn();
    const unsubscribe = fixture.client.onParametersResolved(handler);

    fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId });
    await Promise.resolve();
    unsubscribe();
    await admitParameterManifest(manifest);
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
    fixture.client.terminate();
  });

  it('should suppress a callback when terminated during admission', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const { renderId } = fixture.client.admitPreview();
    const handler = vi.fn();
    fixture.client.onParametersResolved(handler);

    fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId });
    await Promise.resolve();
    fixture.client.terminate();
    await admitParameterManifest(manifest);
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
  });

  it('should contain rejected async subscribers and preserve ordered delivery', async () => {
    const fixture = await createFixture();
    const manifest = await compileManifest();
    const { renderId } = fixture.client.admitPreview();
    const rejection = vi.fn();
    const delivered = Promise.withResolvers<void>();
    let calls = 0;
    process.on('unhandledRejection', rejection);
    try {
      fixture.client.onParametersResolved(async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('consumer rejected');
        }
        delivered.resolve();
      });

      fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId });
      fixture.notifyParameters({ result: { success: true, data: manifest, issues: [] }, renderId });

      await delivered.promise;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(calls).toBe(2);
      expect(rejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', rejection);
      fixture.client.terminate();
    }
  });
});
