/**
 * Runtime tests for {@link definePassthroughTransport} — callables return
 * {@link TransportPlugin} surfaces with no `.host` carrier on the function.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definePassthroughTransport } from '#transport/define-runtime-transport.js';
import type { RuntimeTransportClient, TransportClientReady } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';

const stubClient = <const Id extends 'foo' | 'bar'>(
  id: Id,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, Id> => {
  const closed = Promise.resolve({ cause: 'requested' } as const);
  return {
    id,
    describe(): TransportDescriptor<Id> {
      return {
        id,
        wire: 'in-process',
        memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
        fileSystem: 'unbound',
      };
    },
    async open(): Promise<TransportClientReady> {
      throw new Error('stub');
    },
    async initialize() {
      throw new Error('stub');
    },
    reservePreview: () => ({}),
    renderTimeoutRecovery: { kind: 'unsupported' },
    async resolveGeometry() {
      throw new Error('stub');
    },
    async close() {
      /* Noop */
    },
    closed,
  };
};

describe('definePassthroughTransport — callable TransportPlugin', () => {
  it('returns a callable transport with literal `id` and `materialize`', () => {
    const clientFactory = (): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, 'foo'> =>
      stubClient('foo');
    clientFactory.describe = (): TransportDescriptor<'foo'> => stubClient('foo').describe();

    const transport = definePassthroughTransport({
      id: 'foo',
      clientOptionsSchema: z.object({}).strict(),
      client: clientFactory,
    });

    expect(typeof transport).toBe('function');
    expect(Object.hasOwn(transport, 'host')).toBe(false);

    const plugin = transport({});
    expect(plugin.id).toBe('foo');
    expect(typeof plugin.describe).toBe('function');
    expect(typeof plugin.materialize).toBe('function');
    expect(plugin.materialize().id).toBe('foo');
  });

  it('schema-derived wiring reaches the client factory at materialize()', () => {
    const factory = (options: { readonly tag: string }): RuntimeTransportClient => {
      expect(options.tag).toBe('hello');
      return stubClient('foo');
    };
    factory.describe = (): TransportDescriptor<'foo'> => stubClient('foo').describe();

    const transport = definePassthroughTransport({
      id: 'foo',
      clientOptionsSchema: z.object({ tag: z.string() }).strict(),
      client: factory,
    });

    transport({ tag: 'hello' }).materialize();
  });
});
