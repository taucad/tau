import { describe, expectTypeOf, it } from 'vitest';
import type {
  ChannelServer,
  ChannelServerOptions,
  Port,
  RpcProtocol,
  WireProtocolSchemas,
  WireValidator,
} from '@taucad/rpc';
import type { z } from 'zod';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type {
  RuntimeDocumentProtocol,
  WireArtifact,
  WireExportResult,
  WireRendering,
} from '#types/runtime-document-protocol.types.js';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type WireExport = z.output<typeof runtimeDocumentProtocolSchemas.calls.export.result>;
type WireRendered = z.output<typeof runtimeDocumentProtocolSchemas.notifies.rendered>;
const emptyWireValue = null;

declare const port: Port<unknown>;
declare const impl: ChannelServer<RuntimeDocumentProtocol>;
declare const incompatibleHelloValidator: WireValidator<{
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly protocolVersion: string;
}>;

describe('document protocol type contract', () => {
  it('derives the complete RPC contract from the checked schemas', () => {
    expectTypeOf<RuntimeDocumentProtocol>().toExtend<RpcProtocol>();
    expectTypeOf(runtimeDocumentProtocolSchemas).toExtend<WireProtocolSchemas<RuntimeDocumentProtocol>>();
    expectTypeOf<
      Exact<RuntimeDocumentProtocol['hello'], z.output<typeof runtimeDocumentProtocolSchemas.hello>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Exact<RuntimeDocumentProtocol['calls']['dispose']['args'], typeof emptyWireValue>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Exact<RuntimeDocumentProtocol['calls']['dispose']['result'], typeof emptyWireValue>
    >().toEqualTypeOf<true>();
  });

  it('requires the versioned server hello', () => {
    // @ts-expect-error Runtime servers must publish their hello.
    const missingHello: ChannelServerOptions<RuntimeDocumentProtocol> = { port, sessionKey: 'runtime', impl };
    expectTypeOf(missingHello).toExtend<ChannelServerOptions<RuntimeDocumentProtocol>>();

    const schemas: WireProtocolSchemas<RuntimeDocumentProtocol> = {
      ...runtimeDocumentProtocolSchemas,
      // @ts-expect-error The known protocol version is numeric.
      hello: incompatibleHelloValidator,
    };
    expectTypeOf(schemas).toExtend<WireProtocolSchemas<RuntimeDocumentProtocol>>();
  });

  it('keeps wire binary separate from public materialized bytes', () => {
    expectTypeOf<z.output<typeof runtimeDocumentProtocolSchemas.notifies.rendered>>().toExtend<WireRendered>();
    expectTypeOf<Extract<WireRendered, { success: true }>['artifact']>().toExtend<WireArtifact>();
    expectTypeOf<Extract<WireRendered, { success: true }>['artifact']['content']>().toExtend<
      BinaryContentDelivery | string
    >();
    expectTypeOf<WireExport>().toExtend<WireExportResult>();
    expectTypeOf<Extract<WireExport, { success: true }>['files']>().toExtend<
      readonly [
        { readonly name: string; readonly mimeType: string; readonly bytes: BinaryContentDelivery },
        ...Array<{ readonly name: string; readonly mimeType: string; readonly bytes: BinaryContentDelivery }>,
      ]
    >();
    // A pooled wire key has not yet been materialized to public bytes.
    expectTypeOf<Extract<WireExport, { success: true }>['files'][number]['bytes']>().not.toExtend<
      Uint8Array<ArrayBuffer>
    >();
    // A wire artifact may still contain an inline/pooled delivery wrapper.
    expectTypeOf<Extract<WireRendered, { success: true }>['artifact']>().not.toExtend<
      Extract<WireRendering, { success: true }>['artifact'] & { content: Uint8Array<ArrayBuffer> | string }
    >();
  });
});
