// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { protocolVersion, TransportProtocolVersionError } from '#types/protocol-header.types.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';

const capabilities = { registrations: [], routes: [], renderCapabilities: {} };
const descriptor = {
  id: 'test',
  wire: 'in-process',
  memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
  fileSystem: 'inline',
} as const;

const createFixture = (channel: Channel<RuntimeDocumentProtocol>) => {
  const initialize = vi.fn(async () => ({ capabilities }));
  const transport: RuntimeTransportClient = {
    id: 'test',
    closed: new Promise<never>(() => {
      // The fixture retains its transport until the test completes.
    }),
    signalDocumentAbort: () => false,
    operationTimeoutRecovery: { kind: 'unsupported' },
    describe: () => descriptor,
    open: vi.fn(async () => ({ channel })),
    initialize,
    resolveBinary: vi.fn(),
    close: vi.fn(),
  };
  const client = createRuntimeClient({
    transport: { id: 'test', describe: () => descriptor, materialize: () => transport },
  });
  return { client, initialize };
};

const createChannelFixture = (hello: unknown, ready: Promise<void> = Promise.resolve()) =>
  createFixture({
    ready,
    hello: { payload: hello },
    onNotify: vi.fn(() => () => undefined),
    onClose: vi.fn(() => () => undefined),
  } as unknown as Channel<RuntimeDocumentProtocol>);

describe('document client protocol hello gate', () => {
  it('rejects a malformed runtime hello before initialization', async () => {
    const pair = new MessageChannel();
    const server = createChannelServer({
      port: wrapMessagePort(pair.port1),
      sessionKey: 'malformed-document-hello',
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
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(pair.port2),
      sessionKey: 'malformed-document-hello',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    const fixture = createFixture(channel);

    await expect(fixture.client.connect()).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-hello',
      entry: 'hello',
    });
    expect(fixture.initialize).not.toHaveBeenCalled();
    channel.close();
    server.dispose();
  });

  it('waits for hello readiness before initializing', async () => {
    const ready = Promise.withResolvers<void>();
    const fixture = createChannelFixture(
      { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      ready.promise,
    );
    const pending = fixture.client.connect();
    await Promise.resolve();
    expect(fixture.initialize).not.toHaveBeenCalled();
    ready.resolve();
    await pending;
    expect(fixture.initialize).toHaveBeenCalledOnce();
  });

  it('accepts additive hello metadata from a version-equal worker', async () => {
    const fixture = createChannelFixture({
      server: 'kernel-runtime-worker',
      runtimeVersion: 'test',
      protocolVersion,
      futureSession: 'next',
    });
    await fixture.client.connect();
    expect(fixture.initialize).toHaveBeenCalledOnce();
  });

  it('rejects protocol skew before initialization', async () => {
    const fixture = createChannelFixture({
      server: 'kernel-runtime-worker',
      runtimeVersion: 'test',
      protocolVersion: protocolVersion + 1,
    });
    await expect(fixture.client.connect()).rejects.toEqual(
      new TransportProtocolVersionError(protocolVersion, protocolVersion + 1),
    );
    expect(fixture.initialize).not.toHaveBeenCalled();
  });
});
