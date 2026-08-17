import { describe, expectTypeOf, it } from 'vitest';
import type { ChannelServer, ChannelServerOptions, Port, WireProtocolSchemas, WireValidator } from '@taucad/rpc';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { RuntimeHelloPayload, RuntimeProtocol } from '#types/runtime-protocol.types.js';

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type RuntimeProtocolHello = RuntimeProtocol extends { readonly hello: infer Hello } ? Hello : never;
const cleanupWireValue = null;

declare const port: Port<unknown>;
declare const impl: ChannelServer<RuntimeProtocol>;
declare const incompatibleHelloValidator: WireValidator<{
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly protocolVersion: string;
}>;

describe('RuntimeProtocol exact wire contract', () => {
  it('owns the runtime hello and explicit cleanup wire value', () => {
    expectTypeOf<Exact<RuntimeProtocolHello, RuntimeHelloPayload>>().toEqualTypeOf<true>();
    expectTypeOf<Exact<RuntimeProtocol['calls']['cleanup']['args'], typeof cleanupWireValue>>().toEqualTypeOf<true>();
  });

  it('requires a versioned runtime server hello', () => {
    // @ts-expect-error Runtime servers must publish the declared hello.
    const missingHello: ChannelServerOptions<RuntimeProtocol> = { port, sessionKey: 'runtime', impl };
    expectTypeOf(missingHello).toExtend<ChannelServerOptions<RuntimeProtocol>>();

    const malformedHello: ChannelServerOptions<RuntimeProtocol> = {
      port,
      sessionKey: 'runtime',
      impl,
      // @ts-expect-error protocolVersion is a required known field.
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test' },
    };
    expectTypeOf(malformedHello).toExtend<ChannelServerOptions<RuntimeProtocol>>();
  });

  it('checks the runtime schema inventory against RuntimeProtocol', () => {
    expectTypeOf(runtimeProtocolSchemas).toExtend<WireProtocolSchemas<RuntimeProtocol>>();
  });

  it('rejects an incompatible known-field validator', () => {
    const schemas: WireProtocolSchemas<RuntimeProtocol> = {
      ...runtimeProtocolSchemas,
      // @ts-expect-error protocolVersion must validate to number, not string.
      hello: incompatibleHelloValidator,
    };
    expectTypeOf(schemas).toExtend<WireProtocolSchemas<RuntimeProtocol>>();
  });
});
