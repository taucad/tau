import { CacheCorruptionError } from '#errors.js';
import { digestContent } from '#digest.js';
import type { ActionStore, CacheMaintenance, CacheStoreStatistics, ComputeActionRecord, ContentStore } from '#store.js';

/** One content tier and whether publication to it is mandatory. @public */
export type ContentStoreTier = { readonly store: ContentStore; readonly required: boolean };

/** One action tier and whether publication to it is mandatory. @public */
export type ActionStoreTier = { readonly store: ActionStore; readonly required: boolean };

/** Inputs for content store tier composition. @public */
export type TieredContentStoreOptions = { readonly tiers: readonly ContentStoreTier[] };

/** Inputs for action store tier composition. @public */
export type TieredActionStoreOptions = { readonly tiers: readonly ActionStoreTier[] };

const validateTiers = (tiers: ReadonlyArray<{ readonly required: boolean }>): void => {
  if (tiers.length === 0) {
    throw new TypeError('A tiered store requires at least one tier.');
  }
  if (!tiers.some((tier) => tier.required)) {
    throw new TypeError('A tiered store requires at least one required publication tier.');
  }
};

const aggregateStatistics = (statistics: readonly CacheStoreStatistics[]): CacheStoreStatistics => ({
  entries: statistics.reduce((total, item) => total + item.entries, 0),
  bytes: statistics.reduce((total, item) => total + item.bytes, 0),
  hits: statistics.reduce((total, item) => total + item.hits, 0),
  misses: statistics.reduce((total, item) => total + item.misses, 0),
  evictions: statistics.reduce((total, item) => total + item.evictions, 0),
});

const createTieredMaintenance = (maintenances: readonly CacheMaintenance[]): CacheMaintenance => {
  if (!maintenances.every((maintenance) => maintenance.status === 'supported')) {
    return {
      status: 'unsupported',
      inspect: async ({ signal }) => {
        signal?.throwIfAborted();
        return { status: 'unsupported' };
      },
      clear: async ({ signal }) => {
        signal?.throwIfAborted();
        return { status: 'unsupported' };
      },
    };
  }
  const supported = maintenances;
  return {
    status: 'supported',
    inspect: async ({ signal }) => {
      const statistics: CacheStoreStatistics[] = [];
      for (const maintenance of supported) {
        signal?.throwIfAborted();
        // oxlint-disable-next-line no-await-in-loop -- tiers are intentionally inspected in priority order
        const result = await maintenance.inspect({ signal });
        statistics.push(result.statistics);
      }
      return { status: 'supported', statistics: aggregateStatistics(statistics) };
    },
    clear: async ({ signal }) => {
      for (const maintenance of supported) {
        signal?.throwIfAborted();
        // oxlint-disable-next-line no-await-in-loop -- every configured tier must be cleared
        await maintenance.clear({ signal });
      }
      return { status: 'cleared' };
    },
  };
};

const warmContentTiers = async (input: {
  readonly tiers: readonly ContentStoreTier[];
  readonly beforeIndex: number;
  readonly digest: Parameters<ContentStore['read']>[0]['digest'];
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly signal?: AbortSignal;
}): Promise<void> => {
  for (const tier of input.tiers.slice(0, input.beforeIndex)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- read-through warming follows tier priority
      await tier.store.write({ digest: input.digest, bytes: input.bytes, signal: input.signal });
    } catch {
      input.signal?.throwIfAborted();
    }
  }
};

const warmActionTiers = async (input: {
  readonly tiers: readonly ActionStoreTier[];
  readonly beforeIndex: number;
  readonly record: ComputeActionRecord;
  readonly signal?: AbortSignal;
}): Promise<void> => {
  for (const tier of input.tiers.slice(0, input.beforeIndex)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- read-through warming follows tier priority
      await tier.store.publish({ record: input.record, signal: input.signal });
    } catch {
      input.signal?.throwIfAborted();
    }
  }
};

/**
 * Compose prioritized content stores with read-through warming and required write-through tiers.
 * @param options - Ordered fastest-to-slowest content tiers.
 * @returns One content store facade.
 * @public
 */
export const createTieredContentStore = (options: TieredContentStoreOptions): ContentStore => {
  validateTiers(options.tiers);
  return {
    read: async ({ digest, signal }) => {
      const requiredErrors: unknown[] = [];
      for (const [index, tier] of options.tiers.entries()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- reads short-circuit in tier priority order
          const result = await tier.store.read({ digest, signal });
          if (result.status === 'miss') {
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- a tier hit is verified before it is trusted
          if ((await digestContent({ bytes: result.bytes })) !== digest) {
            throw new CacheCorruptionError('A content tier returned bytes under the wrong digest.');
          }
          // oxlint-disable-next-line no-await-in-loop -- a hit warms faster tiers before it is returned
          await warmContentTiers({
            tiers: options.tiers,
            beforeIndex: index,
            digest,
            bytes: result.bytes,
            signal,
          });
          return { status: 'hit', bytes: new Uint8Array(result.bytes) };
        } catch (error) {
          signal?.throwIfAborted();
          if (tier.required) {
            requiredErrors.push(error);
          }
        }
      }
      if (requiredErrors.length > 0) {
        throw new AggregateError(requiredErrors, 'Required content tiers failed during lookup.');
      }
      return { status: 'miss' };
    },
    write: async ({ digest, bytes, signal }) => {
      let stored = false;
      let existing = false;
      const requiredFailures: unknown[] = [];
      for (const tier of options.tiers) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- all required tiers must publish before success
          const result = await tier.store.write({ digest, bytes, signal });
          if (result.status === 'rejected') {
            if (tier.required) {
              requiredFailures.push(new Error('A required content tier rejected the entry.'));
            }
          } else if (result.status === 'stored') {
            stored = true;
          } else {
            existing = true;
          }
        } catch (error) {
          signal?.throwIfAborted();
          if (tier.required) {
            requiredFailures.push(error);
          }
        }
      }
      if (requiredFailures.length > 0) {
        throw new AggregateError(requiredFailures, 'Required content tiers failed during publication.');
      }
      return stored || !existing ? { status: 'stored' } : { status: 'existing' };
    },
    maintenance: createTieredMaintenance(options.tiers.map((tier) => tier.store.maintenance)),
  };
};

/**
 * Compose prioritized action stores with read-through warming and required write-through tiers.
 * @param options - Ordered fastest-to-slowest action tiers.
 * @returns One action store facade.
 * @public
 */
export const createTieredActionStore = (options: TieredActionStoreOptions): ActionStore => {
  validateTiers(options.tiers);
  return {
    read: async ({ digest, signal }) => {
      const requiredErrors: unknown[] = [];
      for (const [index, tier] of options.tiers.entries()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- reads short-circuit in tier priority order
          const result = await tier.store.read({ digest, signal });
          if (result.status === 'miss') {
            continue;
          }
          if (result.record.actionDigest !== digest) {
            throw new CacheCorruptionError('An action tier returned a record under the wrong digest.');
          }
          // oxlint-disable-next-line no-await-in-loop -- a hit warms faster tiers before it is returned
          await warmActionTiers({
            tiers: options.tiers,
            beforeIndex: index,
            record: result.record,
            signal,
          });
          return { status: 'hit', record: result.record };
        } catch (error) {
          signal?.throwIfAborted();
          if (tier.required) {
            requiredErrors.push(error);
          }
        }
      }
      if (requiredErrors.length > 0) {
        throw new AggregateError(requiredErrors, 'Required action tiers failed during lookup.');
      }
      return { status: 'miss' };
    },
    publish: async ({ record, signal }) => {
      let published = false;
      let existing = false;
      const requiredFailures: unknown[] = [];
      for (const tier of options.tiers) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- all required tiers must publish before success
          const result = await tier.store.publish({ record, signal });
          if (result.status === 'rejected') {
            if (tier.required) {
              requiredFailures.push(new Error('A required action tier rejected the entry.'));
            }
          } else if (result.status === 'published') {
            published = true;
          } else {
            existing = true;
          }
        } catch (error) {
          signal?.throwIfAborted();
          if (tier.required) {
            requiredFailures.push(error);
          }
        }
      }
      if (requiredFailures.length > 0) {
        throw new AggregateError(requiredFailures, 'Required action tiers failed during publication.');
      }
      return published || !existing ? { status: 'published' } : { status: 'existing' };
    },
    maintenance: createTieredMaintenance(options.tiers.map((tier) => tier.store.maintenance)),
  };
};
