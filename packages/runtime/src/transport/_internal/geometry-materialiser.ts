/** Pure transport geometry decoding helpers. @internal */

import type { Geometry } from '@taucad/types';
import type { SharedPool } from '@taucad/memory';
import type { GeometryTransport } from '#types/runtime-protocol.types.js';
import { SharedPoolEntryNotFoundError } from '#transport/_internal/shared-pool-errors.js';

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
