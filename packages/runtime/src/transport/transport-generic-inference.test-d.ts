/**
 * Callable transport bundle generic inference exercised against
 * `transport-projections.ts` helpers.
 */

import { describe, it, assertType } from 'vitest';
import { z } from 'zod';

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type {
  TransportId,
  TransportProtocol,
  TransportBindingsExtra,
  RuntimeFromTransport,
  TransportClientOptions,
} from '#transport/transport-projections.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const stubClient = (): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<string, unknown>>, 'web-worker'> =>
  ({ id: 'web-worker' }) as unknown as RuntimeTransportClient<
    RuntimeProtocol,
    Readonly<Record<string, unknown>>,
    'web-worker'
  >;

/** */
const bundledTransport = defineRuntimeTransport({
  id: 'web-worker',
  clientOptionsSchema: z.object({
    workerScript: z.string(),
    name: z.string().optional(),
  }),
  client: Object.assign(stubClient, {
    describe: (): TransportDescriptor<'web-worker'> => ({
      id: 'web-worker',
      wire: 'web-worker',
      memory: {
        geometryDelivery: 'transfer',
        abortSignal: 'sab-atomics',
      },
      fileSystem: 'unbound',
    }),
  }),
});

describe('transport callable generic inference end-to-end (C12)', () => {
  it('TransportId projection narrows via the bundled callable', () => {
    type Id = TransportId<typeof bundledTransport>;
    assertType<'web-worker'>(undefined as unknown as Id);
  });

  it('TransportProtocol projection defaults to RuntimeProtocol', () => {
    type P = TransportProtocol<typeof bundledTransport>;
    assertType<RuntimeProtocol>(undefined as unknown as P);
  });

  it('TransportBindingsExtra resolves to `{}` when no phantom extras declared', () => {
    type X = TransportBindingsExtra<typeof bundledTransport>;
    assertType<X>({} as Readonly<Record<string, unknown>>);
  });

  it('TransportClientOptions narrows wired client wiring args', () => {
    type C = TransportClientOptions<typeof bundledTransport>;
    assertType<C>({ workerScript: '/worker.js' });
    assertType<C>({ workerScript: '/w.js', name: 'foo' });
    /* @ts-expect-error -- workerScript missing */
    assertType<C>({ name: 'oops' });
  });

  it('RuntimeFromTransport is undefined for worker-backed transports', () => {
    type R = RuntimeFromTransport<ReturnType<typeof bundledTransport>>;
    assertType<undefined>(undefined as unknown as R);
  });

  it('RuntimeFromTransport projects in-process runtime definitions', () => {
    const runtime = defineRuntime({});
    const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    type R = RuntimeFromTransport<typeof transport>;
    assertType<typeof runtime>(undefined as unknown as R);

    // @ts-expect-error -- same-isolate transports own host creation and must receive a runtime.
    inProcessTransport({ fileSystem: fromMemoryFs() });
  });
});
