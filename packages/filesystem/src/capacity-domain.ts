/**
 * Joint storage-capacity accounting for one physical pool.
 *
 * The compute cache and the revision store share bytes: in a browser they draw
 * on one origin's quota, on a native host on one volume. The frozen revision
 * gate requires that cache growth can never consume the reserve kept free for
 * revision writes, so the reserve is owned here — by the filesystem authority
 * that already binds both stores — and every client asks the same function.
 *
 * Measurement is the only impure part; admission is pure so a client can decide
 * without I/O, evict, and ask again.
 */

/**
 * One physical pool whose bytes draw on the same reserve.
 *
 * `webaccess` roots have no domain of their own: their bytes live on a host
 * volume the browser cannot stat, so they measure as unsupported.
 *
 * @public
 */
export type CapacityDomain = { readonly kind: 'origin' } | { readonly kind: 'volume'; readonly path: string };

/**
 * Free and total bytes of a domain, or a typed statement that this host cannot
 * measure it. Never a fabricated zero.
 *
 * @public
 */
export type CapacityMeasurement =
  | { readonly outcome: 'measured'; readonly freeBytes: number; readonly totalBytes: number }
  | { readonly outcome: 'unsupported'; readonly reason: string };

/**
 * Bytes kept free for revision writes in every domain unless a caller declares
 * otherwise. 1 GiB: the disk-host logical store quota the compute charter
 * budgets (EQ9), so a full cache still leaves room for a revision.
 *
 * @public
 */
export const defaultRevisionReserveBytes = 1024 * 1024 * 1024;

/**
 * Free bytes no write of any kind may cross. Revision writes may draw on the
 * reserve down to this floor; below it they are refused too, because a host
 * with less than 64 MiB free cannot complete a snapshot.
 *
 * @public
 */
export const revisionReserveFloorBytes = 64 * 1024 * 1024;

/**
 * A pending write and the class of storage it belongs to. `cache` is the
 * evictable, optional class; `revision` is the primary operation.
 *
 * @public
 */
export type CapacityRequest = {
  readonly bytes: number;
  readonly kind: 'cache' | 'revision';
};

/**
 * Outcome of an admission check. A refusal is typed so a cache client can evict
 * unleased entries up to `shortfallBytes` and retry, or skip caching while the
 * primary operation proceeds.
 *
 * @public
 */
export type CapacityDecision =
  | { readonly decision: 'admit' }
  | {
      readonly decision: 'refuse';
      readonly code: 'capacity-reserve-exceeded' | 'capacity-floor-exceeded';
      readonly shortfallBytes: number;
    }
  | { readonly decision: 'refuse'; readonly code: 'capacity-unmeasured'; readonly reason: string };

/** `StorageManager` widened to what a host may actually expose. */
type OptionalStorageManager = { estimate?: () => Promise<StorageEstimate> } | undefined;

/**
 * Measure a capacity domain: the storage estimate of a browser origin, or
 * `statfs` on the volume holding a native path.
 *
 * @param domain - Pool to measure.
 * @returns Free and total bytes, or a typed unsupported outcome.
 * @public
 *
 * @example <caption>Decide whether a cache write fits</caption>
 * ```typescript
 * import { admitCapacityWrite, measureCapacityDomain } from '@taucad/filesystem';
 *
 * const measurement = await measureCapacityDomain({ kind: 'volume', path: '/Users/me/tau' });
 * const decision = admitCapacityWrite({ measurement, request: { bytes: 4096, kind: 'cache' } });
 * ```
 */
export const measureCapacityDomain = async (domain: CapacityDomain): Promise<CapacityMeasurement> => {
  if (domain.kind === 'origin') {
    // `navigator` is absent in a plain Node runtime before v21 and in some workers.
    const storage: OptionalStorageManager = (globalThis as { navigator?: Navigator }).navigator?.storage;
    if (typeof storage?.estimate !== 'function') {
      return { outcome: 'unsupported', reason: 'navigator.storage.estimate is unavailable' };
    }
    try {
      const { quota, usage } = await storage.estimate();
      if (quota === undefined || usage === undefined) {
        return { outcome: 'unsupported', reason: 'navigator.storage.estimate returned no quota or usage' };
      }
      return { outcome: 'measured', freeBytes: Math.max(quota - usage, 0), totalBytes: quota };
    } catch (error) {
      return { outcome: 'unsupported', reason: `navigator.storage.estimate failed: ${String(error)}` };
    }
  }

  try {
    // Dynamic so the browser barrel never statically reaches a Node builtin;
    // in a browser the import or the call throws and the domain reads
    // unsupported, which is the honest answer for a host volume it cannot see.
    const { statfs } = await import('node:fs/promises');
    // `bavail` is what an unprivileged writer may actually use; `bfree` counts
    // root-reserved blocks this process cannot have.
    const { bsize, blocks, bavail } = await statfs(domain.path);
    return { outcome: 'measured', freeBytes: bavail * bsize, totalBytes: blocks * bsize };
  } catch (error) {
    return { outcome: 'unsupported', reason: `statfs failed: ${String(error)}` };
  }
};

/**
 * Decide whether one write may land in a capacity domain.
 *
 * Cache writes must leave the whole reserve free; revision writes may draw on
 * the reserve down to {@link revisionReserveFloorBytes}. An unmeasurable domain
 * bounds nothing, so cache writes are refused there while the primary revision
 * write still proceeds.
 *
 * @param input - Measurement, the pending write, and the reserve to honour
 *   (default {@link defaultRevisionReserveBytes}, never below the hard floor).
 * @returns `admit`, or a typed refusal carrying the bytes to reclaim.
 * @public
 *
 * @example <caption>Evict unleased entries when the cache would enter the reserve</caption>
 * ```typescript
 * import { admitCapacityWrite, measureCapacityDomain } from '@taucad/filesystem';
 *
 * const measurement = await measureCapacityDomain({ kind: 'origin' });
 * const decision = admitCapacityWrite({ measurement, request: { bytes: 1_048_576, kind: 'cache' } });
 * if (decision.decision === 'refuse' && decision.code === 'capacity-reserve-exceeded') {
 *   console.warn(`evict at least ${decision.shortfallBytes} bytes`);
 * }
 * ```
 */
export const admitCapacityWrite = (input: {
  readonly measurement: CapacityMeasurement;
  readonly request: CapacityRequest;
  readonly reserveBytes?: number;
}): CapacityDecision => {
  const { measurement, request, reserveBytes = defaultRevisionReserveBytes } = input;
  if (!Number.isFinite(request.bytes) || request.bytes < 0) {
    throw new TypeError('Capacity request bytes must be a finite, non-negative number.');
  }

  if (measurement.outcome === 'unsupported') {
    return request.kind === 'revision'
      ? { decision: 'admit' }
      : { decision: 'refuse', code: 'capacity-unmeasured', reason: measurement.reason };
  }

  const floor = revisionReserveFloorBytes;
  // The reserve is derived from the domain, never a universal cap (S5 gate 11):
  // on a pool smaller than four reserves it shrinks to a quarter of the pool.
  const reserve = Math.min(Math.max(reserveBytes, floor), Math.max(Math.floor(measurement.totalBytes / 4), floor));
  const limit = request.kind === 'cache' ? reserve : floor;
  const remaining = measurement.freeBytes - request.bytes;
  if (remaining < limit) {
    return {
      decision: 'refuse',
      code: request.kind === 'cache' ? 'capacity-reserve-exceeded' : 'capacity-floor-exceeded',
      shortfallBytes: limit - remaining,
    };
  }
  return { decision: 'admit' };
};
