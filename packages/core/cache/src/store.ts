import type { ActionDigest, ContentDigest } from '#types.js';

/** Immutable content metadata published by a completed compute action. @public */
export type ComputeOutputReference = {
  readonly digest: ContentDigest;
  readonly size: number;
  readonly mediaType: string;
};

/** Transactional action-to-content record published only after its content exists. @public */
export type ComputeActionRecord = {
  readonly schemaVersion: 1;
  readonly actionDigest: ActionDigest;
  readonly codec: { readonly id: string; readonly version: string };
  readonly output: ComputeOutputReference;
  readonly dependencies: readonly ActionDigest[];
};

/**
 * Why a store refused a write.
 *
 * `conflict` is a byte-exact codec producing different output for one action:
 * publish-once is preserved and the digest is poisoned, never last-writer-wins.
 * `stale-generation` is a write captured before a clear.
 * @public
 */
export type CacheRejectionReason = 'entry-too-large' | 'conflict' | 'stale-generation' | 'quota' | 'unavailable';

/** Current bounded-store usage and lifetime counters. @public */
export type CacheStoreStatistics = {
  readonly entries: number;
  readonly bytes: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
};

/** Required, explicitly discriminated maintenance surface for every cache store. @public */
export type CacheMaintenance =
  | {
      readonly status: 'supported';
      readonly inspect: (input: { readonly signal?: AbortSignal }) => Promise<{
        readonly status: 'supported';
        readonly statistics: CacheStoreStatistics;
      }>;
      readonly clear: (input: { readonly signal?: AbortSignal }) => Promise<{
        readonly status: 'cleared';
      }>;
    }
  | {
      readonly status: 'unsupported';
      readonly inspect: (input: { readonly signal?: AbortSignal }) => Promise<{
        readonly status: 'unsupported';
      }>;
      readonly clear: (input: { readonly signal?: AbortSignal }) => Promise<{
        readonly status: 'unsupported';
      }>;
    };

/**
 * Produce the shared unsupported maintenance outcome.
 * @param input - Optional cancellation context.
 * @returns An explicit unsupported result.
 */
const reportUnsupported = async (input: {
  readonly signal?: AbortSignal;
}): Promise<{ readonly status: 'unsupported' }> => {
  input.signal?.throwIfAborted();
  return { status: 'unsupported' };
};

/** Explicit maintenance facet for stores that cannot inspect or clear themselves. @public */
export const unsupportedCacheMaintenance: Extract<CacheMaintenance, { readonly status: 'unsupported' }> = Object.freeze(
  {
    status: 'unsupported',
    inspect: reportUnsupported,
    clear: reportUnsupported,
  },
);

/** Content-addressed byte store used by compute reuse services and durable adapters. @public */
export type ContentStore = {
  readonly read: (input: {
    readonly digest: ContentDigest;
    readonly signal?: AbortSignal;
  }) => Promise<{ readonly status: 'hit'; readonly bytes: Uint8Array<ArrayBuffer> } | { readonly status: 'miss' }>;
  readonly write: (input: {
    readonly digest: ContentDigest;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly signal?: AbortSignal;
  }) => Promise<
    { readonly status: 'stored' | 'existing' } | { readonly status: 'rejected'; readonly reason: CacheRejectionReason }
  >;
  readonly maintenance: CacheMaintenance;
};

/** Action-to-content record store used as the transactional publication point. @public */
export type ActionStore = {
  readonly read: (input: {
    readonly digest: ActionDigest;
    readonly signal?: AbortSignal;
  }) => Promise<{ readonly status: 'hit'; readonly record: ComputeActionRecord } | { readonly status: 'miss' }>;
  readonly publish: (input: {
    readonly record: ComputeActionRecord;
    readonly signal?: AbortSignal;
  }) => Promise<
    | { readonly status: 'published' | 'existing' }
    | { readonly status: 'rejected'; readonly reason: CacheRejectionReason }
  >;
  readonly maintenance: CacheMaintenance;
};
