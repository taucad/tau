/**
 * Type-conformance tests for {@link definePassthroughTransport} callables wiring
 * {@link TransportPlugin} shapes (no synthesized `.host` accessor on the function).
 */

import { assertType, describe, it } from 'vitest';
import { z } from 'zod';

import { definePassthroughTransport } from '#transport/define-runtime-transport.js';
import type { RuntimeTransportClient, TransportClientReady } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type { TransportPluginId } from '#transport/transport-projections.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';

const stubDescriptor = <Id extends string>(id: Id): TransportDescriptor<Id> => ({
  id,
  wire: 'in-process',
  memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
  fileSystem: 'unbound',
});

const stubClient = <Id extends string>(
  id: Id,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<string, unknown>>, Id> =>
  ({
    id,
    describe(): TransportDescriptor<Id> {
      return stubDescriptor(id);
    },
    async open(): Promise<TransportClientReady> {
      throw new Error('stub');
    },
    async initialize() {
      throw new Error('stub');
    },
    reservePreview() {
      return {};
    },
    renderTimeoutRecovery: { kind: 'unsupported' },
    async resolveGeometry() {
      throw new Error('stub');
    },
    async close() {},
    closed: Promise.resolve({ cause: 'requested' }),
  }) as RuntimeTransportClient<RuntimeProtocol, Readonly<Record<string, unknown>>, Id>;

describe('definePassthroughTransport — TypeScript surface', () => {
  const clientFoo = (): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<string, unknown>>, 'foo'> =>
    stubClient<'foo'>('foo');
  clientFoo.describe = (): TransportDescriptor<'foo'> => stubDescriptor('foo');

  it('narrow literal id onto ReturnType wires', () => {
    const transport = definePassthroughTransport({
      id: 'foo',
      clientOptionsSchema: z.object({ tag: z.string().optional() }).strict(),
      client: clientFoo,
    });

    const wiredFoo = transport({});
    assertType<'foo'>(wiredFoo.id);
  });

  it('works without clientOptionsSchema', () => {
    const clientBar = (): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<string, unknown>>, 'bar'> =>
      stubClient<'bar'>('bar');
    clientBar.describe = (): TransportDescriptor<'bar'> => stubDescriptor('bar');

    const transport = definePassthroughTransport({
      id: 'bar',
      client: clientBar,
    });
    assertType<TransportPluginId<ReturnType<typeof transport>>>('bar');
  });
});
