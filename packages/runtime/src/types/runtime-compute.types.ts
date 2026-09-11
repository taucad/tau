/**
 * Runtime Compute Reuse Contract
 *
 * The shared public surface for kernel-native compute reuse: the composition
 * facet, the opaque host store spec, the batched store session and its
 * authority control, the kernel capability, the runtime-owned reuse scope and
 * its settlement receipt, and the kernel-owned resident binding.
 *
 * Kernels own semantic identity, native residency, admission and codecs; the
 * runtime owns the reuse scope, publication scheduling and telemetry; the host
 * authority owns the store. Bytes cross the boundary only in batches, after the
 * runtime has delivered the result.
 */

import type {
  ActionDigest,
  CacheRetention,
  CacheValue,
  ComputeAction,
  ComputeReuseService,
  ContentDigest,
} from '@taucad/cache-core';

// =============================================================================
// A2. Opaque store spec
// =============================================================================

declare const computeStoreBrand: unique symbol;

/**
 * Opaque, same-realm handle to a host-owned workspace compute store.
 *
 * Constructed by the owning host authority (`fromIndexedDb`, `fromSqlite`, …),
 * never by a caller-supplied path, port or database handle. Resolving one
 * creates a fresh per-client session; the value itself is not
 * structured-clone-safe and carries no wire authority.
 * @public
 */
export type ComputeStore = { readonly [computeStoreBrand]: true };

declare const computeGenerationBrand: unique symbol;

/**
 * Persisted data generation of one store.
 *
 * Bumped by `clear`; it fences disposable reuse. It is a different lifetime
 * from the authority/session identity, which fences stale capabilities, and the
 * two are never collapsed into one counter.
 * @public
 */
export type ComputeGeneration = number & { readonly [computeGenerationBrand]: true };

/**
 * Authorized stable owner of required durable data.
 *
 * One brand shared with `evaluate`, so whole-action and kernel-scope required
 * work name the same owner. Minted by the runtime from an authorized workload
 * context; a caller-provided owner string is not permission.
 * @public
 */
export type ComputeRetention = CacheRetention;

// =============================================================================
// A1. Composition
// =============================================================================

/**
 * The compute facet bound beside `fileSystem` on the worker transport.
 *
 * Omission defaults to `memory` in the library; workspace hosts select
 * `durable`. `off` installs no hook, constructs no recipe and emits no
 * telemetry.
 * @public
 */
export type ComputeBinding =
  | { readonly mode: 'off' }
  | { readonly mode: 'memory' }
  | { readonly mode: 'durable'; readonly store: ComputeStore };

// =============================================================================
// A3. Store engine and session
// =============================================================================

/** One immutable published record: its canonical action, its bytes and their identities. @public */
export type ComputeStoreEntry = {
  readonly action: ComputeAction;
  readonly actionDigest: ActionDigest;
  readonly contentDigest: ContentDigest;
  readonly mediaType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Explicit payload/base assets required to restore this result. Semantic action inputs are not storage closure. */
  readonly requiredContent?: readonly ContentDigest[];
  /** `equivalent` codecs are first-writer-wins and counted; `byte-exact` conflicts poison the digest. */
  readonly determinism: 'byte-exact' | 'equivalent';
};

/** Bounded batched fetch: exact identities plus authorized discovery candidates. @public */
export type ComputeGetInput = {
  readonly digests: readonly ActionDigest[];
  /** Authorized bounded discovery context. Hints select candidates; they never identify actions. */
  readonly discovery?: ComputeDiscoveryContext;
  /** Identities the caller already holds resident and does not want refetched. */
  readonly resident?: readonly ActionDigest[];
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly generation: ComputeGeneration;
  readonly signal?: AbortSignal;
};

/** Outcome of one bounded batched fetch. @public */
export type ComputeGetResult =
  | {
      readonly status: 'ok';
      readonly entries: readonly ComputeStoreEntry[];
      /** Requested identities the store did not return, with their reason. */
      readonly omitted: ReadonlyArray<{
        readonly digest: ActionDigest;
        readonly reason: 'missing' | 'poisoned' | 'budget';
      }>;
    }
  | { readonly status: 'stale-generation'; readonly generation: ComputeGeneration };

/** One batched publication, validated and committed atomically. @public */
export type ComputePutInput = {
  readonly entries: readonly ComputeStoreEntry[];
  /** Context under which these entries may be discovered by peers. */
  readonly discovery?: ComputeDiscoveryContext;
  readonly generation: ComputeGeneration;
  readonly durability: 'disposable' | 'required';
  /** Required work names its authorized retention owner; disposable work has none. */
  readonly retention?: ComputeRetention;
  readonly signal?: AbortSignal;
};

/** Scope identity plus an optional non-authoritative discovery hint. @public */
export type ComputeDiscoveryContext = {
  readonly namespace: string;
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  readonly hint?: CacheValue;
};

/** Outcome of one batched publication. Honest entries commit even when a peer conflicts. @public */
export type ComputePutResult =
  | {
      readonly status: 'committed';
      readonly published: readonly ActionDigest[];
      /** Byte-exact divergence: the digest is poisoned. Equivalent divergence: first writer retained. */
      readonly conflicts: ReadonlyArray<{
        readonly digest: ActionDigest;
        readonly outcome: 'poisoned' | 'first-writer-retained';
      }>;
    }
  | { readonly status: 'stale-generation'; readonly generation: ComputeGeneration }
  | { readonly status: 'quota'; readonly logicalBytes: number; readonly logicalQuota: number }
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'no-durable-storage' };

/** Promote an existing entry to required durability under an authorized owner. @public */
export type ComputePinInput = {
  readonly digests: readonly ActionDigest[];
  readonly retention: ComputeRetention;
  readonly generation: ComputeGeneration;
  readonly signal?: AbortSignal;
};

/** Outcome of a required promotion. `no-durable-storage` is never a false success. @public */
export type ComputePinResult =
  | { readonly status: 'pinned'; readonly pinned: readonly ActionDigest[] }
  | { readonly status: 'missing'; readonly digests: readonly ActionDigest[] }
  | { readonly status: 'stale-generation'; readonly generation: ComputeGeneration }
  | { readonly status: 'no-durable-storage' };

/** Release one recovered owner's roots. @public */
export type ComputeReleaseInput = {
  readonly retention: ComputeRetention;
  readonly signal?: AbortSignal;
};

/** One client's session over a workspace store. No path, handle or port crosses it. @public */
export type ComputeStoreSession = {
  /** Persisted data generation observed when this session opened. */
  readonly generation: ComputeGeneration;
  /** True when this backend can acknowledge required durability at all. */
  readonly durable: boolean;
  readonly get: (input: ComputeGetInput) => Promise<ComputeGetResult>;
  readonly put: (input: ComputePutInput) => Promise<ComputePutResult>;
  readonly pin: (input: ComputePinInput) => Promise<ComputePinResult>;
  readonly release: (input: ComputeReleaseInput) => Promise<{ readonly status: 'released' }>;
  readonly close: () => Promise<void>;
};

/** Workspace-scoped engine bound at the filesystem authority. @public */
export type ComputeStoreEngine = {
  readonly open: (input: { readonly workspace: string; readonly signal?: AbortSignal }) => Promise<ComputeStoreSession>;
};

// =============================================================================
// A4. Authority control
// =============================================================================

/** Maintained logical counters. Unknown physical metrics are discriminated, never faked as zero. @public */
export type ComputeStoreReport = {
  readonly entries: number;
  readonly logicalBytes: number;
  readonly pinnedBytes: number;
  readonly pendingBytes: number;
  readonly generation: ComputeGeneration;
  readonly physicalBytes: { readonly status: 'known'; readonly bytes: number } | { readonly status: 'unsupported' };
};

/** Authorized host operations. Never members of a kernel's compute scope. @public */
export type ComputeStoreControl = {
  readonly inspect: (input: { readonly signal?: AbortSignal }) => Promise<ComputeStoreReport>;
  readonly clear: (input: { readonly signal?: AbortSignal }) => Promise<{
    readonly status: 'cleared';
    readonly generation: ComputeGeneration;
    /** Required closure preserved through the clear. */
    readonly retained: number;
  }>;
  readonly collect: (input: {
    /** Milliseconds this slice may spend before yielding. */
    readonly budget: number;
    readonly cursor?: string;
    readonly signal?: AbortSignal;
  }) => Promise<{
    readonly status: 'complete' | 'incomplete';
    readonly reclaimed: number;
    readonly cursor?: string;
  }>;
};

// =============================================================================
// A7. Resident binding
// =============================================================================

/** Logical charge, known codec bytes and unsupported native memory, kept distinct. @public */
export type ResidentCacheStats = {
  readonly entries: number;
  readonly logicalBytes: number;
  readonly encodedBytes: { readonly status: 'known'; readonly bytes: number } | { readonly status: 'unsupported' };
  readonly evictions: number;
  readonly omissions: number;
};

/** One entry the kernel exported for publication, with its own content identity. @public */
export type ResidentExportEntry = {
  readonly action: ComputeAction;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: string;
  readonly determinism: 'byte-exact' | 'equivalent';
};

/**
 * The kernel-owned native cache the runtime binds one scope to.
 *
 * The kernel owns safe native clones, validation tokens, admission and codec
 * lifetime. Bounded runtime export holds cannot be ignored by eviction, and
 * native handles cannot be disposed while an export is in flight.
 * @public
 */
export type ResidentCacheBinding = {
  /** Synchronous membership test. No I/O, codec or mesh work. */
  readonly contains: (input: { readonly digest: ActionDigest }) => boolean;
  /** Adopt a warm batch into native residency. */
  readonly importEntries: (input: {
    readonly entries: readonly ComputeStoreEntry[];
    readonly signal: AbortSignal;
  }) => Promise<{ readonly imported: readonly ActionDigest[]; readonly omitted: readonly ActionDigest[] }>;
  /** Encode the selected admitted results. Runs only after the runtime permits publication. */
  readonly exportEntries: (input: {
    readonly digests: readonly ActionDigest[];
    readonly signal: AbortSignal;
  }) => Promise<{ readonly entries: readonly ResidentExportEntry[]; readonly omitted: readonly ActionDigest[] }>;
  readonly stats: () => ResidentCacheStats;
  /** Fences the mirror immediately; native clear executes at a safe boundary. */
  readonly clear: (input: { readonly generation: ComputeGeneration }) => void;
};

// =============================================================================
// A6. Scope and receipt
// =============================================================================

/** One admitted action identity with its provisional cost, announced synchronously. @public */
export type ComputeAnnouncement =
  | {
      readonly kind: 'action';
      readonly action: ComputeAction;
      readonly digest: ActionDigest;
      /** Milliseconds the native call that produced it actually took. */
      readonly computeDuration: number;
      /** Cheap conservative provisional charge; reconciled after off-path export. */
      readonly estimatedBytes: number;
    }
  | {
      readonly kind: 'batch';
      /** Content identity is obtained after export; a local epoch is never an action identity. */
      readonly batchId: string;
      readonly dirty: boolean;
      /** Milliseconds the engine spent producing this dirty range. */
      readonly computeDuration: number;
      readonly estimatedBytes: number;
    };

/** Bounded warm request: one authority round trip resolves discovery and fetch. @public */
export type ComputeWarmInput = {
  readonly digests: readonly ActionDigest[];
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
};

/** Outcome of one warm request, after the post-fetch and post-import fence rechecks. @public */
export type ComputeWarmResult =
  | {
      readonly status: 'imported';
      readonly imported: readonly ActionDigest[];
      readonly omitted: readonly ActionDigest[];
      readonly bytes: number;
    }
  | { readonly status: 'stale-generation' }
  | { readonly status: 'unavailable'; readonly reason: string };

/** Synchronous admission outcome for one announcement batch. @public */
export type ComputeAnnounceResult = {
  readonly admitted: readonly ActionDigest[];
  readonly rejected: ReadonlyArray<{
    readonly digest: ActionDigest;
    readonly reason: 'below-floor' | 'duplicate' | 'pending-budget';
  }>;
};

/** How a scope ended. A cancelled scope publishes nothing. @public */
export type CloseComputeScopeInput = { readonly outcome: 'delivered' | 'failed' | 'cancelled' };

/** Terminal, settle-once outcome of one scope's publication tail. @public */
export type ComputeScopeSettlement = {
  readonly status: 'published' | 'abandoned' | 'failed';
  readonly published: readonly ActionDigest[];
  readonly omitted: readonly ActionDigest[];
  readonly conflicts: ReadonlyArray<{
    readonly digest: ActionDigest;
    readonly outcome: 'poisoned' | 'first-writer-retained';
  }>;
  readonly reason?: string;
};

/**
 * Idempotent receipt of one closed scope.
 *
 * `settled` never rejects unobserved. Awaiting it is explicit — a test or a
 * headless seed barrier — and never an implicit render dependency.
 * @public
 */
export type ComputeScopeReceipt = {
  readonly settled: Promise<ComputeScopeSettlement>;
};

/**
 * One operation's reuse scope, owned by the runtime's serialized kernel owner.
 * @public
 */
export type ComputeReuseScope = {
  /** Data generation captured at open and rechecked after every async boundary. */
  readonly generation: ComputeGeneration;
  readonly warm: (input: ComputeWarmInput) => Promise<ComputeWarmResult>;
  /** Synchronous metadata only: no byte conversion, no I/O, no per-lookup span. */
  readonly announce: (input: { readonly entries: readonly ComputeAnnouncement[] }) => ComputeAnnounceResult;
  /** Seals metadata and returns the same receipt on repetition. Never native cleanup or encoding. */
  readonly close: (input: CloseComputeScopeInput) => ComputeScopeReceipt;
};

// =============================================================================
// A5. Kernel capability
// =============================================================================

/** Everything one scope needs, bound once by the kernel. @public */
export type OpenComputeScopeInput = {
  /** Adapter namespace; every announced action must match it. */
  readonly namespace: string;
  readonly producer: ComputeAction['producer'];
  readonly environment: CacheValue;
  /** Bounded mergeable discovery hint. Never semantic identity. */
  readonly discovery?: CacheValue;
  /** The kernel's native cache. */
  readonly resident: ResidentCacheBinding;
  /** Milliseconds of measured native cost below which a result is not admitted. */
  readonly admissionFloor?: number;
};

/**
 * The compute facet as a kernel sees it.
 *
 * `off` carries no operations at all: a consumer branches once on `status`
 * before canonicalizing anything, so an off arm pays no keying cost.
 * @public
 */
export type KernelComputeCapability =
  | { readonly status: 'off' }
  | {
      readonly status: 'on';
      readonly mode: 'memory' | 'durable';
      readonly evaluate: ComputeReuseService['evaluate'];
      readonly openScope: (input: OpenComputeScopeInput) => ComputeReuseScope;
    };

// =============================================================================
// A9. Middleware eligibility
// =============================================================================

/**
 * Whether a whole-build stage may be replaced by a terminal cached artifact.
 *
 * Replaces a loosely coupled progressive boolean: a stage that produces scene
 * events is `ineligible` with a stated reason, and is executed.
 * @public
 */
export type BuildReuse = { readonly status: 'eligible' } | { readonly status: 'ineligible'; readonly reason: string };
