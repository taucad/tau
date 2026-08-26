/**
 * Type definitions for the symmetric host-side surface
 * ({@link createRuntimeHost}).
 *
 * The host plane is the mirror image of {@link createRuntimeClient}:
 * a consumer passes a pre-built {@link RuntimeTransportHost} and the
 * runtime drives `open()` / `close()` lifecycle. The runtime core
 * never inspects wire-level concerns (channel, ports, SAB pools,
 * encoders); those live entirely inside the transport host.
 */

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- variance: accepts any transport host generic
import type { RuntimeTransportHost } from '#transport/runtime-transport.types.js';

/**
 * Forward-compatibility marker for a future host-side file content
 * cache. The v1 shape is opaque so the type slot exists without
 * over-committing to an API.
 *
 * @public
 */
export type RuntimeFileCache = unknown;

/**
 * Configuration accepted by {@link createRuntimeHost}.
 *
 * - {@link RuntimeHostConfig.transport transport} — required
 *   transport host instance (`nodeWorkerHost(...)`, `electronUtilityHost(...)`, …).
 *   (Legacy `inProcessTransport` is client-only — there is no kernel host for
 *   same-isolate topologies.) Owns wire negotiation,
 *   geometry/file delivery encoding, abort signalling and the
 *   filesystem strategy.
 *
 * @public
 */
export type RuntimeHostConfig = {
  /**
   * Named host factory result (e.g. `nodeWorkerHost(...)`, `electronUtilityHost(...)`). Required.
   */
  readonly transport: RuntimeTransportHost;
};

/**
 * Handle returned from {@link createRuntimeHost}.
 *
 * @public
 */
export type RuntimeHostHandle = {
  /** Stable identifier derived from the transport host id. */
  readonly id: string;
  /**
   * Tear down the host. Idempotent; subsequent calls are no-ops.
   */
  dispose(): void;
};
