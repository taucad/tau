// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';
import { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';
import { protocolVersion, TransportProtocolVersionError } from '#types/protocol-header.types.js';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';

const createTransportFixture = (channel: Channel<RuntimeProtocol>) => {
  const initialize = vi.fn(async () => ({
    capabilities: { registrations: [], routes: [], renderCapabilities: {} },
  }));
  const transport: RuntimeTransportClient = {
    id: 'test',
    closed: new Promise<never>(() => {
      // Intentionally pending for the fixture lifetime.
    }),
    reservePreview: () => ({}),
    renderTimeoutRecovery: { kind: 'unsupported' },
    describe: () => ({
      id: 'test',
      wire: 'in-process',
      memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
      fileSystem: 'inline',
    }),
    open: vi.fn(async () => ({ channel })),
    initialize,
    resolveGeometry: vi.fn(),
    close: vi.fn(),
  };

  return { client: new RuntimeWorkerClient({ transport }), channel, initialize };
};

const createFixture = (hello: unknown, ready: Promise<void> = Promise.resolve()) =>
  createTransportFixture({
    ready,
    hello: { payload: hello },
    onNotify: vi.fn(() => () => undefined),
  } as unknown as Channel<RuntimeProtocol>);

describe('RuntimeWorkerClient initialize hello gate', () => {
  it('rejects a malformed runtime hello at channel readiness', async () => {
    const pair = new MessageChannel();
    const server = createChannelServer({
      port: wrapMessagePort(pair.port1),
      sessionKey: 'malformed-runtime-hello',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion: 'invalid' },
      impl: {
        async call() {
          return undefined;
        },
        async *listen() {
          yield undefined;
        },
      },
    });
    const channel = createChannelClient<RuntimeProtocol>({
      port: wrapMessagePort(pair.port2),
      sessionKey: 'malformed-runtime-hello',
      protocolSchemas: runtimeProtocolSchemas,
    });
    const fixture = createTransportFixture(channel);

    await expect(fixture.client.initialize()).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-hello',
      entry: 'hello',
    });
    expect(fixture.initialize).not.toHaveBeenCalled();

    channel.close();
    server.dispose();
  });

  it('waits for the wire hello before initializing the runtime', async () => {
    const ready = Promise.withResolvers<void>();
    const fixture = createFixture(
      { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', protocolVersion },
      ready.promise,
    );

    const pending = fixture.client.initialize();
    await Promise.resolve();
    expect(fixture.initialize).not.toHaveBeenCalled();

    ready.resolve();
    await pending;
    expect(fixture.initialize).toHaveBeenCalledOnce();
  });

  it('accepts additive hello fields from a version-equal worker', async () => {
    const fixture = createFixture({
      server: 'kernel-runtime-worker',
      runtimeVersion: '0.0.0-test',
      protocolVersion,
      sessionId: 'future-session',
    });

    await expect(fixture.client.initialize()).resolves.toBeUndefined();
    expect(fixture.initialize).toHaveBeenCalledOnce();
  });

  it('rejects protocol skew with a typed error before runtime initialization', async () => {
    const fixture = createFixture({
      server: 'kernel-runtime-worker',
      runtimeVersion: '0.0.0-test',
      protocolVersion: protocolVersion + 1,
    });

    await expect(fixture.client.initialize()).rejects.toEqual(
      new TransportProtocolVersionError(protocolVersion, protocolVersion + 1),
    );
    expect(fixture.initialize).not.toHaveBeenCalled();
  });
});
