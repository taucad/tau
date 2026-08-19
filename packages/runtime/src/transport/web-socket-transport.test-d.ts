/**
 * Type-level contract of `webSocketTransport`: the literal id flows into
 * the materialised client, `url` is required, an inline `fileSystem` is
 * accepted, and a raw socket is not an option (Antipattern 5).
 */

import { describe, it, assertType, expectTypeOf } from 'vitest';

import type { fromNodeFs } from '#filesystem/from-node-fs.js';
import { webSocketTransport } from '#transport/web-socket-transport.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';

describe('webSocketTransport type inference', () => {
  it('materialises a RuntimeTransportClient carrying the literal id', () => {
    const client = webSocketTransport({ url: 'ws://127.0.0.1:8080' }).materialize();
    assertType<RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, 'web-socket'>>(client);
    expectTypeOf(client.id).toEqualTypeOf<'web-socket'>();
  });

  it('describes itself with the literal id', () => {
    expectTypeOf(webSocketTransport({ url: new URL('ws://127.0.0.1:8080') }).describe()).toEqualTypeOf<
      TransportDescriptor<'web-socket'>
    >();
  });

  it('accepts an inline filesystem handle', () => {
    const plugin = webSocketTransport({
      url: 'ws://127.0.0.1:8080',
      fileSystem: undefined as unknown as ReturnType<typeof fromNodeFs>,
    });
    expectTypeOf(plugin.id).toEqualTypeOf<'web-socket'>();
  });

  it('rejects a raw socket option', () => {
    // @ts-expect-error `{ socket }` is a wire primitive — the transport owns socket construction.
    webSocketTransport({ url: 'ws://127.0.0.1:8080', socket: {} });
  });

  it('rejects a missing url', () => {
    // @ts-expect-error `url` is required.
    webSocketTransport({});
  });
});
