/**
 * Conformance test C11 — {@link defineRuntimeTransport} typing:
 *
 * - Literal `id` flows onto {@link TransportPlugin}.
 * - Client options infer from the returned callable via {@link TransportClientOptions}.
 * - Host options project from standalone host factories via {@link TransportHostOptions}.
 */

import { describe, it, assertType, expectTypeOf } from 'vitest';
import { z } from 'zod';
import type { Channel, ChannelServerHandle, RpcProtocol } from '#transport/index.js';

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import type {
  RuntimeTransportClient,
  RuntimeTransportHost,
  TransportClientReady,
  TransportHostReady,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type {
  TransportClientOptions,
  TransportHostOptions,
  TransportPluginId,
} from '#transport/transport-projections.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';

const stubDescribe =
  <Id extends string>(id: Id) =>
  (): TransportDescriptor<Id> => ({
    id,
    wire: 'cross-process',
    memory: {
      geometryDelivery: 'copy',
      abortSignal: 'wire-notify',
    },
    fileSystem: 'unbound',
  });

const stubClient = <Id extends string>(
  id: Id,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, Id> =>
  ({ id }) as unknown as RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, Id>;

const stubHost = <Id extends string>(
  id: Id,
): RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, Id> =>
  ({ id }) as unknown as RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, Id>;

const schemaHost = z.object({ port: z.number().default(0) });

/** */
const standaloneHostFixture = (_options: z.input<typeof schemaHost>): RuntimeTransportHost<RpcProtocol> =>
  stubHost('fixture');

describe('defineRuntimeTransport generic inference (C11)', () => {
  it('exposes the channel protocol types transport authors must name', () => {
    expectTypeOf<TransportClientReady<RpcProtocol>['channel']>().toEqualTypeOf<Channel>();
    expectTypeOf<TransportHostReady<RpcProtocol>['channel']>().toEqualTypeOf<ChannelServerHandle>();
  });

  it('preserves the literal id on the wired TransportPlugin', () => {
    const emptyClientSchema = z.object({}).strict();

    const stubClientBind = (_options: z.infer<typeof emptyClientSchema>): RuntimeTransportClient =>
      stubClient('my-transport');
    stubClientBind.describe = (): TransportDescriptor<'my-transport'> => stubDescribe('my-transport')();

    const transport = defineRuntimeTransport({
      id: 'my-transport',
      clientOptionsSchema: emptyClientSchema,
      client: stubClientBind,
    });

    assertType<TransportPluginId<ReturnType<typeof transport>>>('my-transport');
  });

  it('infers client options from clientOptionsSchema via z.input', () => {
    const clientFactory = (args: { url: string; retries?: number }): RuntimeTransportClient => {
      assertType<string>(args.url);
      assertType<number | undefined>(args.retries);
      return stubClient('with-client-options');
    };
    clientFactory.describe = (): TransportDescriptor<'with-client-options'> => stubDescribe('with-client-options')();

    const transport = defineRuntimeTransport({
      id: 'with-client-options',
      clientOptionsSchema: z.object({
        url: z.string(),
        retries: z.number().default(3),
      }),
      client: clientFactory,
    });

    type InferredClient = TransportClientOptions<typeof transport>;
    assertType<InferredClient>({ url: 'wss://example', retries: 5 });
    assertType<InferredClient>({ url: 'wss://example' });
  });

  it('projects host options from a standalone host factory', () => {
    type InferredHost = TransportHostOptions<typeof standaloneHostFixture>;
    assertType<InferredHost>({ port: 8080 });
    assertType<InferredHost>({});
  });

  it('wiring call returns a TransportPlugin', () => {
    const clientFactory = (_options: z.infer<typeof empty>): RuntimeTransportClient => stubClient('shape-check');
    clientFactory.describe = (): TransportDescriptor<'shape-check'> => stubDescribe('shape-check')();

    const empty = z.object({}).strict();

    const transport = defineRuntimeTransport({
      id: 'shape-check',
      clientOptionsSchema: empty,
      client: clientFactory,
    });

    assertType<TransportPlugin>(transport({}));
  });
});
