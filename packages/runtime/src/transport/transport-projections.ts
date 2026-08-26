/**
 * Projection helpers — extract phantom-tagged generics from a
 * {@link TransportPlugin} returned by bundled transport factories
 * (`typeof webWorkerTransport extends (opts) => TransportPlugin`) without
 * repeating type parameters at the consumer surface.
 *
 * Pattern mirrors the `KernelPlugin` projections in
 * `#plugins/plugin-types.js` (`CollectKernelIds`, `RenderOptionsFor`).
 *
 * @public
 */

import type { RpcProtocol } from '@taucad/rpc';
import type { TransportPlugin } from '#transport/runtime-transport.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

// oxlint-disable @typescript-eslint/no-explicit-any -- variance: phantom slot projection

/** */
type TransportCallable = (...args: any[]) => TransportPlugin<any, any, any, any>;

/**
 * Extract the literal transport id carried by {@link TransportPlugin}.
 *
 * @public
 */
export type TransportPluginId<P extends TransportPlugin<any, any, any, any>> =
  P extends TransportPlugin<any, any, infer Id, any> ? Id : never;

/**
 * Extract the literal `Id` from a bundled transport callable
 * (`webWorkerTransport({...})`).
 *
 * @public
 */
export type TransportId<F extends TransportCallable> =
  ReturnType<F> extends TransportPlugin<any, any, infer Id, any> ? Id : never;

/**
 * Extract the protocol carried by the bundled transport callable.
 *
 * @public
 */
export type TransportProtocol<F extends TransportCallable> =
  ReturnType<F> extends TransportPlugin<infer P, any, any, any> ? P : RpcProtocol;

/**
 * Extract the host-side bindings extension shape.
 *
 * @public
 */
export type TransportBindingsExtra<F extends TransportCallable> =
  ReturnType<F> extends TransportPlugin<any, infer B, any, any> ? B : Readonly<Record<never, never>>;

/**
 * Extract the worker/host-owned runtime definition carried by a transport
 * plugin. Same-isolate transports such as `inProcessTransport({ runtime })`
 * carry this phantom; worker-backed transports intentionally project
 * `undefined` and use the client's explicit type-only runtime generic.
 *
 * @public
 */
export type RuntimeFromTransport<Transport> =
  Transport extends TransportPlugin<any, any, any, infer Runtime>
    ? Runtime extends AnyRuntimeDefinition
      ? Runtime
      : undefined
    : undefined;

/**
 * Extract the consumer options shape accepted by `transport(...)`.
 *
 * @public
 */
export type TransportClientOptions<F extends TransportCallable> = F extends (
  options: infer O,
) => TransportPlugin<any, any, any, any>
  ? O
  : Readonly<Record<string, unknown>>;

/**
 * Host options projected from a standalone host factory
 * `(options) => {@link RuntimeTransportHost}` — not from the bundled
 * client callable (use alongside `typeof webWorkerHost`).
 *
 * @public
 */
export type TransportHostOptions<H extends (...args: never) => unknown> =
  Parameters<H> extends readonly [infer First, ...infer _Rest] ? First : Readonly<Record<string, unknown>>;

// oxlint-enable @typescript-eslint/no-explicit-any

/* Re-export the phantom slot type alias so conformance tests satisfy
 * structural compatibility checks against {@link TransportPlugin}. */

export type {
  TransportIdPhantomSlot,
  TransportProtocolPhantomSlot,
  TransportBindingsExtraPhantomSlot,
  TransportRuntimePhantomSlot,
} from '#transport/runtime-transport.types.js';
