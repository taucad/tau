/**
 * Channel-middleware geometry materialisation (transport-internal).
 *
 * Wraps `Channel<RuntimeProtocol>.onNotify('geometryComputed')` with the
 * pool-resolution + hash-dedupe pipeline that previously lived inline
 * inside `RuntimeWorkerClient.onGeometry`. Extracted so the same
 * pipeline can be reused by every transport (web, node, in-process, and
 * future custom transports) without reimplementing pool semantics or
 * duplicate suppression.
 *
 * Responsibilities:
 *
 * 1. **Pool resolution** — `delivery: 'pooled'` payloads are resolved
 *    via the supplied {@link SharedPool}; `delivery: 'inline'` payloads
 *    pass through untouched.
 * 2. **Inline passthrough** — non-`gltf` formats (e.g. `svg`) bypass
 *    pool resolution entirely.
 * 3. **Hash de-dupe** — when a successful result emits the same
 *    render hash as the previous emission, the handler is
 *    skipped. Failed results never participate in dedupe and reset the
 *    last-known hash.
 *
 * The middleware never throws; pool-miss errors surface to the handler
 * as a synthetic failed {@link HashedGeometryResult} (`code: 'RUNTIME'`).
 *
 * Lives under `transport/_internal/` because it is wire-layer plumbing
 * consumed exclusively by transport implementations (host side).
 *
 * @internal
 */

import type { Geometry } from '@taucad/types';
import type { SharedPool } from '@taucad/memory';
import type { Channel } from '@taucad/rpc';
import type {
  GeometryTransport,
  HashedGeometryResultTransport,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';
import type { HashedGeometryResult, KernelIssue } from '#types/runtime.types.js';
import { SharedPoolEntryNotFoundError } from '#transport/_internal/shared-pool-errors.js';

/**
 * Unsubscribe handle returned by {@link subscribeMaterialisedGeometry}.
 *
 * @public
 */
export type MaterialiserUnsubscribe = () => void;

/**
 * Handler invoked once per `geometryComputed` notify (post-resolution,
 * post-dedupe).
 *
 * @public
 */
export type GeometryMaterialiserHandler = (result: HashedGeometryResult, rgen: number) => void;

/**
 * Options for {@link subscribeMaterialisedGeometry}.
 *
 * @public
 */
export type GeometryMaterialiserOptions = {
  /**
   * Shared-memory pool used to resolve `delivery: 'pooled'` payloads.
   * Mutually exclusive with {@link resolveGeometry}.
   */
  pool?: SharedPool;
  /**
   * Per-payload resolver delegated to the transport plugin. When
   * supplied, `subscribeMaterialisedGeometry` calls it for every
   * geometry transport on the wire; pool / inline / SAB decisions stay
   * inside the transport.
   */
  resolveGeometry?: (transport: GeometryTransport) => Promise<Geometry>;
  /**
   * Suppress duplicate emissions when the per-shape hash list matches
   * the previous successful emission. Defaults to `true`.
   *
   * Failures never participate in dedupe (errors must always surface);
   * a failed emission resets the last-known hash so the next successful
   * emission always fires.
   */
  dedupeByHash?: boolean;
};

/**
 * Resolve a single wire-level {@link GeometryTransport} into a fully
 * materialised consumer-facing {@link Geometry}.
 *
 * Pure with respect to the supplied pool — `delivery: 'inline'` and
 * non-`gltf` payloads bypass the pool entirely.
 *
 * @param payload - wire-level geometry transport
 * @param pool - optional shared-memory pool for `pooled` deliveries
 * @returns the materialised geometry
 *
 * @public
 */
export async function materialiseGeometry(payload: GeometryTransport, pool: SharedPool | undefined): Promise<Geometry> {
  if (payload.format !== 'gltf') {
    return payload;
  }
  const { content, hash } = payload;
  if (content.delivery === 'inline') {
    return { format: 'gltf', content: content.bytes, hash };
  }
  const view = pool?.resolveCopy(content.key);
  if (!view) {
    throw new SharedPoolEntryNotFoundError(content.key);
  }
  return { format: 'gltf', content: view, hash };
}

/**
 * Resolve every `GeometryTransport` payload in a wire-level
 * {@link HashedGeometryResultTransport} into the consumer-facing
 * {@link HashedGeometryResult}.
 *
 * @param transport - wire-level kernel result
 * @param pool - optional shared-memory pool for `pooled` deliveries
 * @returns the materialised result
 *
 * @public
 */
export async function materialiseHashedGeometryResult(
  transport: HashedGeometryResultTransport,
  pool?: SharedPool,
): Promise<HashedGeometryResult> {
  if (!transport.success) {
    return transport;
  }
  const data = await materialiseGeometry(transport.data, pool);
  return { ...transport, data };
}

/**
 * Compute a stable dedupe key from a successful result's render hash.
 */
function hashKeyFor(data: { readonly hash: string }): string {
  return data.hash;
}

/**
 * Subscribe to materialised geometry notifies on a typed runtime channel.
 *
 * @param channel - any object exposing `onNotify` (typically a
 *   `Channel<RuntimeProtocol>`); narrowed to `Pick` so callers can
 *   pass either the full `Channel` or a thin adapter.
 * @param handler - invoked once per resolved result (post-dedupe).
 * @param options - pool + dedupe configuration.
 * @returns an unsubscribe handle.
 *
 * @public
 */
export function subscribeMaterialisedGeometry(
  channel: Pick<Channel<RuntimeProtocol>, 'onNotify'>,
  handler: GeometryMaterialiserHandler,
  options: GeometryMaterialiserOptions = {},
): MaterialiserUnsubscribe {
  const dedupe = options.dedupeByHash ?? true;
  const { pool, resolveGeometry } = options;
  let lastHashKey: string | undefined;

  const resolveOne = async (transport: HashedGeometryResultTransport): Promise<HashedGeometryResult> => {
    if (resolveGeometry) {
      if (!transport.success) {
        return transport;
      }
      const data = await resolveGeometry(transport.data);
      return { ...transport, data };
    }
    return materialiseHashedGeometryResult(transport, pool);
  };

  const resolve = async (transport: HashedGeometryResultTransport, rgen: number): Promise<void> => {
    let resolved: HashedGeometryResult;
    try {
      resolved = await resolveOne(transport);
    } catch (error) {
      lastHashKey = undefined;
      const message = error instanceof Error ? error.message : String(error);
      const issue: KernelIssue = {
        message,
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
      };
      handler({ success: false, issues: [issue] }, rgen);
      return;
    }

    if (!resolved.success) {
      lastHashKey = undefined;
      handler(resolved, rgen);
      return;
    }

    if (dedupe) {
      const key = hashKeyFor(resolved.data);
      if (key === lastHashKey) {
        return;
      }
      lastHashKey = key;
    }

    handler(resolved, rgen);
  };

  return channel.onNotify('geometryComputed', (args) => {
    void resolve(args.result, args.rgen);
  });
}
