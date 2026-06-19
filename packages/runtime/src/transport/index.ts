/* oxlint-disable no-barrel-files/no-barrel-files -- public subpath barrel */

/**
 * Runtime transport authoring surface — entry point at
 * `@taucad/runtime/transport`.
 *
 * Carries only the cross-environment author API: the
 * {@link defineRuntimeTransport} factory, the
 * {@link runtimeProtocolSchemas} wire validators, and shared types.
 * Every concrete transport ships behind its own topology-tagged
 * subpath so consumers signal their target topology at import time:
 *
 * ```typescript
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 * import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
 * ```
 *
 * Why split:
 *
 *   - `nodeWorkerTransport` statically imports `node:worker_threads`,
 *     which would trigger "Module 'node:worker_threads' has been
 *     externalized for browser compatibility" warnings from rolldown
 *     / Vite the moment any browser bundle touched the barrel.
 *   - `webWorkerTransport` runs against DOM globals (`globalThis`
 *     `addEventListener` / `postMessage`) and has no analogue in a
 *     Node CLI bundle.
 *   - `inProcessTransport` is cross-env (`MessageChannel` is global
 *     in Node 15+ and every modern browser), so it co-locates at its
 *     own subpath for architectural symmetry.
 *
 * The pattern mirrors the filesystem split
 * (`@taucad/runtime/filesystem/{node,browser}`).
 *
 * @public
 */

export { defineRuntimeTransport, definePassthroughTransport } from '#transport/define-runtime-transport.js';

/**
 * Wire-protocol Zod validators for every {@link RuntimeProtocol} call and
 * notify. The bundled transports (`inProcessTransport`,
 * `webWorkerTransport`, `nodeWorkerTransport`) wire these in by
 * default; external transports (e.g. `electronUtilityTransport`)
 * should pass them to `createChannelClient` / `createChannelServer`
 * via the `protocolSchemas` option for parity at the wire boundary.
 *
 * @public
 */
export { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';

export type {
  TransportPlugin,
  RuntimeTransportClient,
  RuntimeTransportHost,
  RuntimeInitializePayload,
  RuntimeInitializeMemoryHandle,
  EncodedGeometry,
  EncodedFileBytes,
  HostInitializeBindings,
  HostInitializeBindingsCore,
  HostAbortBinding,
  HostGeometryDeliveryBinding,
  HostFileDeliveryBinding,
  TransportClientReady,
  TransportHostReady,
  TransportHelloPayload,
  TransportDescriptor,
} from '#transport/runtime-transport.types.js';

export type {
  TransportPluginId,
  TransportId,
  TransportProtocol,
  TransportBindingsExtra,
  RuntimeFromTransport,
  TransportClientOptions,
  TransportHostOptions,
} from '#transport/transport-projections.js';
