/**
 * `defineRuntimeTransport` — author-facing factory for runtime
 * transports.
 *
 * Authors supply a client factory plus a Zod schema for the
 * consumer-facing options shape; the function returns
 * a **callable** `(options) => TransportPlugin` consumed by
 * `createRuntimeClient`. Hosts remain standalone process-specific exports
 * such as {@link webWorkerHost}; they are not part of a renderer/client graph.
 *
 * @public
 */

import type { z } from 'zod';
import type { RpcProtocol } from '@taucad/rpc';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient, TransportPlugin } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';

/** */
type ClientLike<
  Protocol extends RpcProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>>,
  Id extends string,
  ClientOptions,
> = ((options: ClientOptions) => RuntimeTransportClient<Protocol, BindingsExtra, Id>) & {
  describe: (options: ClientOptions) => TransportDescriptor<Id>;
};

/** */
const synthTransportCallable = <
  Protocol extends RpcProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>>,
  Id extends string,
  ClientOptions,
>(definition: {
  readonly id: Id;
  readonly client: ClientLike<Protocol, BindingsExtra, Id, ClientOptions>;
}): ((options: ClientOptions) => TransportPlugin<Protocol, BindingsExtra, Id>) => {
  const { client: clientFactory, id } = definition;
  if (typeof clientFactory.describe !== 'function') {
    throw new TypeError(`${id}: client factory is missing required static .describe(options)`);
  }

  return (options: ClientOptions) => ({
    id,
    describe: (): TransportDescriptor<Id> => clientFactory.describe(options),
    materialize: () => clientFactory(options),
  });
};

/**
 * Define a transport whose client options are inferred from a Zod schema.
 *
 * @public
 */
export function defineRuntimeTransport<
  const Id extends string,
  ClientOptionsSchema extends z.ZodType,
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
>(definition: {
  readonly id: Id;
  readonly protocol?: Protocol;
  readonly clientOptionsSchema: ClientOptionsSchema;
  readonly client: ClientLike<Protocol, BindingsExtra, Id, z.input<ClientOptionsSchema>>;
}): (options: z.input<ClientOptionsSchema>) => TransportPlugin<Protocol, BindingsExtra, Id>;

/* ----- Implementation ---------------------------------------- */

/* oxlint-disable @typescript-eslint/no-explicit-any -- runtime impl: schemas erased; impl-signature is overload-driven */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- runtime impl: definition is `any` by overload contract */
/* oxlint-disable @typescript-eslint/explicit-module-boundary-types -- runtime impl: type is provided by the public overloads above */

/**
 * Strips the schema and protocol fields (consumed only at type-inference time and
 * by tooling) and returns a callable `(options) =>
 * {@link TransportPlugin}`.
 *
 * @param definition - Transport plugin definition (one of the overloads above).
 * @returns Callable transport factory producing a {@link TransportPlugin}.
 *
 * @public
 */
export function defineRuntimeTransport(definition: any): any {
  const { clientOptionsSchema: _cs, protocol: _p, ...rest } = definition;

  /* oxlint-disable @typescript-eslint/consistent-type-assertions -- split definition for synth */
  return synthTransportCallable(rest as { readonly id: string; readonly client: ClientLike<any, any, any, any> });
  /* oxlint-enable @typescript-eslint/consistent-type-assertions */
}

/* oxlint-enable @typescript-eslint/no-explicit-any */
/* oxlint-enable @typescript-eslint/no-unsafe-assignment */
/* oxlint-enable @typescript-eslint/explicit-module-boundary-types */

/* ============================================================ *
 * definePassthroughTransport — same-isolate transport author API
 * ============================================================ */

/**
 * Define a passthrough transport whose client owns the entire
 * pipeline. Mirrors {@link defineRuntimeTransport} for same-isolate
 * topologies (no wire crossing — `inProcessTransport`,
 * future `worklet`
 * passthroughs) where there is no separate host runtime to bootstrap.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md`
 * (R3): there is no stub `host()` on the exported callable —
 * bootstrap uses standalone host factories (`webWorkerHost`, …) or
 * in-process equivalents only where applicable.
 *
 * @public
 */
export function definePassthroughTransport<
  const Id extends string,
  ClientOptionsSchema extends z.ZodType,
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
>(definition: {
  readonly id: Id;
  readonly protocol?: Protocol;
  readonly clientOptionsSchema: ClientOptionsSchema;
  readonly client: ClientLike<Protocol, BindingsExtra, Id, z.input<ClientOptionsSchema>>;
}): (options: z.input<ClientOptionsSchema>) => TransportPlugin<Protocol, BindingsExtra, Id>;

/**
 * Define a passthrough transport without a client-options schema. The
 * client accepts opaque `Record<string, unknown>` options.
 *
 * @public
 */
export function definePassthroughTransport<
  const Id extends string,
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
>(definition: {
  readonly id: Id;
  readonly protocol?: Protocol;
  readonly client: ClientLike<Protocol, BindingsExtra, Id, Readonly<Record<string, unknown>>>;
}): (options: Readonly<Record<string, unknown>>) => TransportPlugin<Protocol, BindingsExtra, Id>;

/* oxlint-disable @typescript-eslint/no-explicit-any -- runtime impl: schemas + host factory erased / synthesised; impl-signature is overload-driven */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- runtime impl: definition is `any` by overload contract */
/* oxlint-disable @typescript-eslint/explicit-module-boundary-types -- runtime impl: type is provided by the public overloads above */
/* oxlint-disable @typescript-eslint/consistent-type-assertions -- runtime impl: synthesised plugin needs assertion to satisfy the conditional overload return */

/**
 * Implementation — returns callable `(opts) => {@link TransportPlugin}`.
 *
 * @param definition - Passthrough transport definition (one of the overloads above).
 * @returns Callable producing a {@link TransportPlugin}.
 *
 * @public
 */
export function definePassthroughTransport(definition: any): any {
  const { clientOptionsSchema: _cs, protocol: _p, ...rest } = definition;
  return synthTransportCallable(rest as { readonly id: string; readonly client: ClientLike<any, any, any, any> });
}

/* oxlint-enable @typescript-eslint/no-explicit-any */
/* oxlint-enable @typescript-eslint/no-unsafe-assignment */
/* oxlint-enable @typescript-eslint/explicit-module-boundary-types */
/* oxlint-enable @typescript-eslint/consistent-type-assertions */
