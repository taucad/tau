import { digestAction, digestContent, canonicalizeComputeAction } from '@taucad/cache-core';
import type { ActionDigest, CacheValue, ComputeAction } from '@taucad/cache-core';
import type {
  ComputeGeneration,
  ComputeScopeReceipt,
  ComputeReuseScope,
  ComputeStoreEntry,
  KernelComputeCapability,
  ResidentCacheBinding,
  ResidentExportEntry,
} from '@taucad/runtime/kernel';
import { decodeStoredEnvelope } from '#compute-stored-envelope.js';
import { computeNamespace, operationCodecs, validateComputeAction } from '#picogk-compute-contract.js';

type RecordEntry = ComputeStoreEntry & {
  readonly nativeBytes: number;
  readonly computeDuration: number;
};
/** Private adapter limits. Native residency is separately enforced by the current Library bridge. @internal */
export type ComputeAdapterOptions = {
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly maxEncodedBytes: number;
  readonly maxNativeBytes: number;
  readonly maxEntries: number;
};

type ComputeJob = {
  readonly scope: ComputeReuseScope;
  readonly generation: ComputeGeneration;
  readonly signal: AbortSignal;
  readonly preload: () => readonly ComputeStoreEntry[];
  readonly acceptDelivered: (records: readonly RecordEntry[]) => Promise<readonly ActionDigest[]>;
  readonly finish: (outcome: 'delivered' | 'failed' | 'cancelled') => ComputeScopeReceipt;
};
type ComputeReuseAdapter = {
  readonly resident: ResidentCacheBinding;
  readonly openJob: (input: {
    readonly compute: KernelComputeCapability;
    readonly signal: AbortSignal;
  }) => Promise<ComputeJob | undefined>;
  readonly dispose: () => void;
};
/**
 * Bounded encoded residency over the existing store scope; never stores native handles.
 * @param options - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 * @internal
 */
export const createPicogkComputeReuse = (options: ComputeAdapterOptions): ComputeReuseAdapter => {
  for (const limit of [options.maxEncodedBytes, options.maxNativeBytes, options.maxEntries]) {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new TypeError('Invalid PicoGK compute limits.');
    }
  }
  const entries = new Map<ActionDigest, ComputeStoreEntry>();
  let encodedBytes = 0,
    metadataBytes = 0,
    evictions = 0,
    omissions = 0;
  let currentGeneration: ComputeGeneration | undefined;
  const jobs = new Map<AbortController, ComputeReuseScope>();
  let disposed = false,
    pendingSettlements = 0;
  const releaseDisposed = (): void => {
    if (disposed && jobs.size === 0 && pendingSettlements === 0) {
      entries.clear();
      encodedBytes = 0;
      metadataBytes = 0;
    }
  };
  const identity = (action: ComputeAction): string =>
    canonicalizeComputeAction({
      ...action,
      operation: 'identity',
      inputs: [],
      arguments: {},
      codec: { id: 'identity', version: '1' },
    });
  const expected = identity({
    schemaVersion: 1,
    namespace: computeNamespace,
    producer: options.producer,
    environment: options.environment,
    operation: 'identity',
    arguments: {},
    inputs: [],
    codec: { id: 'identity', version: '1' },
  });
  const valid = async (entry: ComputeStoreEntry): Promise<boolean> => {
    try {
      validateComputeAction(entry.action);
      decodeStoredEnvelope({
        bytes: entry.bytes,
        family: operationCodecs[entry.action.operation as keyof typeof operationCodecs],
        maximumEncoded: options.maxEncodedBytes,
        maximumNative: options.maxNativeBytes,
      });
      if (
        entry.action.namespace !== computeNamespace ||
        identity(entry.action) !== expected ||
        entry.bytes.byteLength > options.maxEncodedBytes
      ) {
        return false;
      }
      return (
        (await digestAction({ action: entry.action })) === entry.actionDigest &&
        (await digestContent({ bytes: entry.bytes })) === entry.contentDigest
      );
    } catch {
      return false;
    }
  };
  const metadataCharge = (entry: ComputeStoreEntry): number =>
    4096 + 8 * new TextEncoder().encode(canonicalizeComputeAction(entry.action)).byteLength;
  const remove = (digest: ActionDigest): void => {
    const entry = entries.get(digest);
    if (!entry) {
      return;
    }
    encodedBytes -= entry.bytes.byteLength;
    metadataBytes -= metadataCharge(entry);
    entries.delete(digest);
  };
  const store = (entry: ComputeStoreEntry): boolean => {
    const old = entries.get(entry.actionDigest);
    if (old) {
      if (old.contentDigest !== entry.contentDigest) {
        omissions++;
        return false;
      }
      return true;
    }
    const metadata = metadataCharge(entry);
    if (options.maxEntries === 0 || entry.bytes.byteLength + metadata > options.maxEncodedBytes) {
      omissions++;
      return false;
    }
    while (
      entries.size >= options.maxEntries ||
      encodedBytes + metadataBytes + entry.bytes.byteLength + metadata > options.maxEncodedBytes
    ) {
      const first = entries.keys().next().value;
      if (first === undefined) {
        return false;
      }
      remove(first);
      evictions++;
    }
    // One adapter-owned immutable copy; no native object escapes a Go.
    entries.set(entry.actionDigest, {
      ...entry,
      action: JSON.parse(canonicalizeComputeAction(entry.action)) as ComputeAction,
      bytes: new Uint8Array(entry.bytes),
    });
    encodedBytes += entry.bytes.byteLength;
    metadataBytes += metadata;
    return true;
  };
  const resident: ResidentCacheBinding = {
    contains: ({ digest }) => entries.has(digest),
    importEntries: async ({ entries: incoming, signal }) => {
      const observed = currentGeneration;
      const imported: ActionDigest[] = [],
        omitted: ActionDigest[] = [];
      for (const entry of incoming) {
        signal.throwIfAborted();

        // oxlint-disable-next-line no-await-in-loop -- Validate/admit one record before retaining another bounded buffer.
        const accepted = await valid(entry);
        signal.throwIfAborted();
        if (currentGeneration !== observed) {
          return {
            imported: [],
            omitted: incoming.map((record) => record.actionDigest),
          };
        }
        if (accepted && store(entry)) {
          imported.push(entry.actionDigest);
        } else {
          omitted.push(entry.actionDigest);
          omissions++;
        }
      }
      return { imported, omitted };
    },
    exportEntries: async ({ digests, signal }) => {
      signal.throwIfAborted();
      const exported: ResidentExportEntry[] = [],
        omitted: ActionDigest[] = [];
      for (const digest of digests) {
        const entry = entries.get(digest);
        if (entry) {
          exported.push({
            action: entry.action,
            bytes: entry.bytes,
            mediaType: entry.mediaType,
            determinism: entry.determinism,
          });
        } else {
          omitted.push(digest);
        }
      }
      return { entries: exported, omitted };
    },
    stats: () => ({
      entries: entries.size,
      logicalBytes: encodedBytes + metadataBytes,
      encodedBytes: { status: 'known', bytes: encodedBytes },
      evictions,
      omissions,
    }),
    clear: ({ generation }) => {
      currentGeneration = generation;
      for (const [job, scope] of jobs) {
        if (scope.generation !== generation) {
          job.abort(new Error('PicoGK compute generation changed.'));
        }
      }
      entries.clear();
      encodedBytes = 0;
      metadataBytes = 0;
    },
  };

  const openJob = async (input: {
    readonly compute: KernelComputeCapability;
    readonly signal: AbortSignal;
  }): Promise<ComputeJob | undefined> => {
    if (disposed) {
      throw new Error('PicoGK compute adapter disposed.');
    }
    if (input.compute.status === 'off') {
      return undefined;
    }
    const scope = input.compute.openScope({
      namespace: computeNamespace,
      producer: options.producer,
      environment: options.environment,
      resident,
    });
    const control = new AbortController();
    jobs.set(control, scope);
    const signal = AbortSignal.any([input.signal, control.signal]);
    try {
      await scope.warm({
        digests: [],
        maxEntries: options.maxEntries,
        maxBytes: options.maxEncodedBytes,
        signal,
      });
      signal.throwIfAborted();
      // Scope.warm captured and rechecked the real store generation. No parallel epoch.
      currentGeneration ??= scope.generation;
      const { generation } = scope;
      if (currentGeneration !== generation) {
        throw new Error('Stale PicoGK compute scope.');
      }
      let finished = false;
      const added = new Set<ActionDigest>();
      const live = (): void => {
        signal.throwIfAborted();
        if (finished || currentGeneration !== generation) {
          throw new Error('Closed/stale PicoGK compute job.');
        }
      };
      const finish = (outcome: 'delivered' | 'failed' | 'cancelled'): ComputeScopeReceipt => {
        if (finished) {
          throw new Error('PicoGK compute job already closed.');
        }
        finished = true;
        jobs.delete(control);
        if (outcome !== 'delivered') {
          for (const digest of added) {
            remove(digest);
          }
        }
        const receipt = scope.close({ outcome });
        // The existing binding supplies encoded bytes to late exportEntries; native handles are never retained.
        pendingSettlements++;
        const settle = async (): Promise<Awaited<ComputeScopeReceipt['settled']>> => {
          try {
            return await receipt.settled;
          } finally {
            pendingSettlements--;
            releaseDisposed();
          }
        };
        return { ...receipt, settled: settle() };
      };
      return {
        scope,
        generation,
        signal,
        /**
         * Immutable bounded encoded snapshot; transport writes it within its session artifact owner.
         * @internal
         * @returns The validated result or owned lifecycle receipt.
         */
        preload: (): readonly ComputeStoreEntry[] => {
          live();
          return [...entries.values()];
        },
        /**
         * Called only after stable native serialization and successful scene artifact delivery.
         * @internal
         * @param records - Private codec or lifecycle input.
         * @returns The validated result or owned lifecycle receipt.
         */
        acceptDelivered: async (records: readonly RecordEntry[]) => {
          live();
          let nativeBytes = 0,
            publicationBytes = 0;
          const seen = new Set<ActionDigest>();
          // Validate every record before modifying resident state; a corrupt candidate never removes geometry.
          for (const record of records) {
            live();
            if (
              seen.has(record.actionDigest) ||
              !Number.isSafeInteger(record.nativeBytes) ||
              record.nativeBytes < 0 ||
              !Number.isFinite(record.computeDuration) ||
              record.computeDuration < 0 ||
              // oxlint-disable-next-line no-await-in-loop -- Check ordered candidates before any resident state is committed.
              !(await valid(record))
            ) {
              throw new TypeError('Invalid delivered compute record.');
            }
            seen.add(record.actionDigest);
            nativeBytes += record.nativeBytes;
            publicationBytes += record.bytes.byteLength;
            if (
              !Number.isSafeInteger(nativeBytes) ||
              !Number.isSafeInteger(publicationBytes) ||
              nativeBytes > options.maxNativeBytes ||
              publicationBytes > options.maxEncodedBytes
            ) {
              throw new TypeError('Delivered compute budget exceeded.');
            }
          }
          live();
          const admitted: ActionDigest[] = [];
          for (const record of records) {
            const result = scope.announce({
              entries: [
                {
                  kind: 'action',
                  action: record.action,
                  digest: record.actionDigest,
                  computeDuration: record.computeDuration,
                  estimatedBytes: record.bytes.byteLength + record.nativeBytes,
                },
              ],
            });
            const existed = entries.has(record.actionDigest);
            if (result.admitted.includes(record.actionDigest) && store(record)) {
              admitted.push(record.actionDigest);
              if (!existed) {
                added.add(record.actionDigest);
              }
            }
          }
          return admitted;
        },
        finish,
      };
    } catch (error) {
      jobs.delete(control);
      scope.close({ outcome: signal.aborted ? 'cancelled' : 'failed' });
      releaseDisposed();
      throw error;
    }
  };
  return {
    resident,
    openJob,
    dispose: () => {
      disposed = true;
      for (const control of jobs.keys()) {
        control.abort(new Error('PicoGK compute adapter disposed.'));
      }
      releaseDisposed();
    },
  };
};
