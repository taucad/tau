/**
 * Runtime-owned compute reuse: capability, scope, publication tail.
 *
 * Kernels own identity, residency, admission and codecs; this module owns the
 * reuse scope, the generation fence, the post-delivery publication permit, the
 * aggregate pending budget and the single evaluate service — all over ONE store
 * session, so there is one fence, one coalescing table and one poisoning rule
 * (D5).
 */

import {
  createComputeReuseService,
  createMemoryActionStore,
  createMemoryContentStore,
  digestAction,
  digestContent,
  unsupportedCacheMaintenance,
} from '@taucad/cache-core';
import type {
  ActionDigest,
  ActionStore,
  CacheRetention,
  ComputeAction,
  ComputeActionRecord,
  ComputeReuseService,
  ContentStore,
} from '@taucad/cache-core';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import type {
  ComputeAnnounceResult,
  ComputeAnnouncement,
  ComputeBinding,
  ComputeDiscoveryContext,
  ComputeGeneration,
  ComputeReuseScope,
  ComputeScopeReceipt,
  ComputeScopeSettlement,
  ComputeStore,
  ComputeStoreControl,
  ComputeStoreEngine,
  ComputeStoreEntry,
  ComputeStoreSession,
  ComputeWarmInput,
  ComputeWarmResult,
  KernelComputeCapability,
  OpenComputeScopeInput,
  ResidentCacheBinding,
} from '#types/runtime-compute.types.js';

/** Aggregate publication holds across every scope of one worker (D24, U36). */
const maxPendingBytes = 64 * 1024 * 1024;
const maxPendingEntries = 4096;
/** Milliseconds an announced hold may sit before the runtime abandons it. */
const maxPendingAge = 60_000;
/** Default admission floor: results whose own native call took at least this long (EQ2). */
/** Milliseconds of measured native cost below which nothing is admitted. */
const defaultAdmissionFloor = 1;
/** Teardown budget for the publication tail (I2, U11). */
/** Milliseconds the publication tail may take at teardown. */
const defaultDrainBudget = 2000;
const defaultWarmEntries = 4096;
const defaultWarmBytes = 64 * 1024 * 1024;
/** Bound on the read cache `evaluate` keeps in front of the store session. */
const readCacheBytes = 64 * 1024 * 1024;

/** What `evaluate` knows about a publication that its action record does not carry. */
type PublicationSource = {
  readonly action: ComputeAction;
  readonly determinism: 'byte-exact' | 'equivalent';
};

type PendingEntry = {
  readonly digest: ActionDigest;
  readonly estimatedBytes: number;
  readonly announcedAt: number;
};

type ScopeState = {
  readonly operationId: string;
  generation: ComputeGeneration;
  readonly generationPromise: Promise<ComputeGeneration>;
  generationCaptured: boolean;
  readonly discovery: ComputeDiscoveryContext;
  readonly resident: ResidentCacheBinding;
  readonly pending: Map<ActionDigest, PendingEntry>;
  outcome: 'open' | 'delivered' | 'failed' | 'cancelled';
  receipt: ComputeScopeReceipt | undefined;
  settle: ((settlement: ComputeScopeSettlement) => void) | undefined;
  settled: boolean;
  running: boolean;
};

/** Registered opaque durable store specs. Host engines register theirs in W2. @internal */
const durableEngines = new WeakMap<
  ComputeStore,
  {
    readonly engine: ComputeStoreEngine;
    readonly workspace: string;
    readonly control: ComputeStoreControl;
    readonly generation?: () => Promise<ComputeGeneration>;
  }
>();

/**
 * Register a host-minted durable store spec against its engine.
 * @param input - The opaque spec, its engine and the workspace it addresses.
 * @returns The opaque spec, ready to place in a `durable` binding.
 * @internal
 */
export const _registerComputeStore = (input: {
  readonly spec: ComputeStore;
  readonly engine: ComputeStoreEngine;
  readonly workspace: string;
  readonly control: ComputeStoreControl;
  readonly generation?: () => Promise<ComputeGeneration>;
}): ComputeStore => {
  durableEngines.set(input.spec, {
    engine: input.engine,
    workspace: input.workspace,
    control: input.control,
    ...(input.generation ? { generation: input.generation } : {}),
  });
  return input.spec;
};

/** Resolve a same-realm opaque store for trusted transport composition. @internal */
export const _resolveComputeStore = (
  spec: ComputeStore,
):
  | {
      readonly engine: ComputeStoreEngine;
      readonly workspace: string;
      readonly control: ComputeStoreControl;
      readonly generation?: () => Promise<ComputeGeneration>;
    }
  | undefined => durableEngines.get(spec);

const emptySettlement = (status: ComputeScopeSettlement['status'], reason?: string): ComputeScopeSettlement => ({
  status,
  published: [],
  omitted: [],
  conflicts: [],
  ...(reason === undefined ? {} : { reason }),
});

/**
 * Adapt one store session to the content/action store pair `evaluate` uses.
 *
 * Whole-action reuse and kernel-scope reuse therefore share one physical store,
 * one generation and one poisoning rule instead of being implemented twice.
 */
const adaptSession = (
  session: ComputeStoreSession,
  publications: ReadonlyMap<ActionDigest, PublicationSource>,
  liveGeneration: () => Promise<ComputeGeneration>,
): { readonly contentStore: ContentStore; readonly actionStore: ActionStore } => {
  // The bounded LRU tiers are a read cache only: the session is the one writer.
  const contentCache = createMemoryContentStore({ maxBytes: readCacheBytes });
  const actionCache = createMemoryActionStore({ maxBytes: readCacheBytes });
  let { generation } = session;
  const refreshGeneration = async (): Promise<ComputeGeneration> => {
    const current = await liveGeneration();
    if (current !== generation) {
      generation = current;
      await contentCache.maintenance.clear({});
      await actionCache.maintenance.clear({});
    }
    return current;
  };
  return {
    contentStore: contentCache,
    actionStore: {
      read: async ({ digest, signal }) => {
        const current = await refreshGeneration();
        const cached = await actionCache.read({ digest, ...(signal ? { signal } : {}) });
        if (cached.status === 'hit') {
          return cached;
        }
        const result = await session.get({
          digests: [digest],
          maxEntries: 1,
          maxBytes: defaultWarmBytes,
          generation: current,
          ...(signal ? { signal } : {}),
        });
        const entry = result.status === 'ok' ? result.entries[0] : undefined;
        if (!entry) {
          return { status: 'miss' };
        }
        const record: ComputeActionRecord = {
          schemaVersion: 1,
          actionDigest: entry.actionDigest,
          codec: entry.action.codec,
          output: { digest: entry.contentDigest, size: entry.bytes.byteLength, mediaType: entry.mediaType },
          dependencies: entry.action.inputs.filter((input) => input.kind === 'action').map((input) => input.digest),
        };
        await contentCache.write({ digest: entry.contentDigest, bytes: entry.bytes, ...(signal ? { signal } : {}) });
        await actionCache.publish({ record, ...(signal ? { signal } : {}) });
        return { status: 'hit', record };
      },
      publish: async ({ record, signal }) => {
        const current = await refreshGeneration();
        // D5: `evaluate` writes to the same store session as the kernel scope, so a
        // durable engine can pin what it published. The action record alone cannot
        // name a store entry, so the canonical action is carried from `evaluate`.
        const source = publications.get(record.actionDigest);
        const content = await contentCache.read({ digest: record.output.digest, ...(signal ? { signal } : {}) });
        if (!source || content.status === 'miss') {
          return { status: 'rejected', reason: 'unavailable' };
        }
        const result = await session.put({
          entries: [
            {
              action: source.action,
              actionDigest: record.actionDigest,
              contentDigest: record.output.digest,
              mediaType: record.output.mediaType,
              bytes: content.bytes,
              determinism: source.determinism,
            },
          ],
          generation: current,
          durability: 'disposable',
          ...(signal ? { signal } : {}),
        });
        if (result.status !== 'committed') {
          const reason =
            result.status === 'quota' || result.status === 'stale-generation' ? result.status : 'unavailable';
          return { status: 'rejected', reason };
        }
        if (!result.published.includes(record.actionDigest)) {
          return { status: 'rejected', reason: 'conflict' };
        }
        return actionCache.publish({ record, ...(signal ? { signal } : {}) });
      },
      maintenance: unsupportedCacheMaintenance,
    },
  };
};

/** One worker's compute facet, resolved once from its transport binding. @internal */
export type ComputeCapabilityHost = {
  readonly capability: (signal: AbortSignal, operationId?: string) => KernelComputeCapability;
  /**
   * Permit the publication tail of every closed scope.
   *
   * Called by the runtime only after the operation's result has actually been
   * delivered to the client. A microtask, a `.then` or an unawaited export is
   * not this barrier (D2, I2, U9, U35).
   */
  readonly permitPublication: () => void;
  /** Await every settled receipt within a budget, then abandon the rest (U11, U36). */
  readonly drain: (input?: { readonly deadline?: number }) => Promise<void>;
  readonly dispose: () => Promise<void>;
  /** Authority-side inspect/clear/collect, when this binding has a control facet. */
  readonly control: ComputeStoreControl | undefined;
};

/** Off installs nothing: every lifecycle hook is an explicit no-operation. */
const noOperation = (): void => {
  // Off has no scope, no store session and no publication tail to act on.
};
const noAsyncOperation = async (): Promise<void> => {
  noOperation();
};

const offHost: ComputeCapabilityHost = {
  capability: () => ({ status: 'off' }),
  permitPublication: noOperation,
  drain: noAsyncOperation,
  dispose: noAsyncOperation,
  control: undefined,
};

/**
 * Resolve one worker's compute facet from its transport binding.
 *
 * `off` constructs nothing at all: no engine, no session, no evaluate service,
 * no telemetry (D14, U1). A `durable` spec that this realm cannot resolve
 * degrades to memory with one diagnostic; required work still refuses a false
 * durability guarantee.
 * @param input - The bound facet, the workspace it addresses and a diagnostic sink.
 * @returns The worker-scoped compute host.
 * @internal
 */
export const createComputeCapabilityHost = (input: {
  readonly binding: ComputeBinding;
  readonly workspace: string;
  readonly onDiagnostic?: (message: string) => void;
  readonly onScopeSettled?: (summary: {
    readonly operationId: string;
    readonly generation: ComputeGeneration;
    readonly settlement: ComputeScopeSettlement;
  }) => void;
}): ComputeCapabilityHost => {
  if (input.binding.mode === 'off') {
    return offHost;
  }

  const memory = createMemoryComputeEngine();
  const resolved = input.binding.mode === 'durable' ? durableEngines.get(input.binding.store) : undefined;
  if (input.binding.mode === 'durable' && !resolved) {
    input.onDiagnostic?.(
      'Compute reuse degraded to memory: the supplied durable store spec is not resolvable in this realm.',
    );
  }
  const mode: 'memory' | 'durable' = resolved ? 'durable' : 'memory';
  const engine = resolved?.engine ?? memory.engine;
  const workspace = resolved?.workspace ?? input.workspace;
  const control = resolved?.control ?? memory.control({ workspace });

  let sessionPromise: Promise<ComputeStoreSession> | undefined;
  const openSession = async (): Promise<ComputeStoreSession> => {
    sessionPromise ??= engine.open({ workspace });
    return sessionPromise;
  };

  /** Bounded by the evaluations in flight: each entry is deleted when its caller settles. */
  const publications = new Map<ActionDigest, PublicationSource>();
  let servicePromise: Promise<ComputeReuseService> | undefined;
  const openService = async (): Promise<ComputeReuseService> => {
    servicePromise ??= (async () => {
      const session = await openSession();
      const stores = adaptSession(session, publications, liveGeneration);
      return createComputeReuseService({
        ...stores,
        promote: async ({ actionDigest: action, retention, signal }) => {
          const generation = await liveGeneration();
          const outcome = await session.pin({
            digests: [action],
            retention,
            generation,
            signal,
          });
          return outcome.status === 'pinned' ? { status: 'promoted' } : { status: 'no-durable-storage' };
        },
      });
    })();
    return servicePromise;
  };

  let currentGeneration = 1 as ComputeGeneration;
  let generationObserved = false;
  const observeGeneration = async (): Promise<void> => {
    try {
      const session = await openSession();
      currentGeneration = session.generation;
      generationObserved = true;
    } catch {
      // A degraded binding keeps the default generation.
    }
  };
  const bootstrap = observeGeneration();

  /**
   * The live data generation reported by this binding's control facet.
   */
  const liveGeneration = async (): Promise<ComputeGeneration> => {
    let generation: ComputeGeneration;
    if (resolved?.generation) {
      generation = await resolved.generation();
    } else {
      const inspection = await control.inspect({});
      generation = inspection.generation;
    }
    currentGeneration = generation;
    generationObserved = true;
    return generation;
  };

  const residentGenerations = new WeakMap<ResidentCacheBinding, ComputeGeneration>();
  const captureScopeGeneration = async (scope: ScopeState): Promise<void> => {
    if (!scope.generationCaptured) {
      scope.generation = await scope.generationPromise;
      scope.generationCaptured = true;
      const previous = residentGenerations.get(scope.resident);
      if (previous !== undefined && previous !== scope.generation) {
        scope.resident.clear({ generation: scope.generation });
      }
      residentGenerations.set(scope.resident, scope.generation);
    }
  };

  const scopes = new Set<ScopeState>();
  const inFlight = new Set<Promise<void>>();
  let pendingBytes = 0;
  let pendingEntries = 0;

  const releaseHold = (scope: ScopeState): void => {
    for (const entry of scope.pending.values()) {
      pendingBytes -= entry.estimatedBytes;
      pendingEntries -= 1;
    }
    scope.pending.clear();
  };

  const settleOnce = (scope: ScopeState, settlement: ComputeScopeSettlement): void => {
    if (scope.settled) {
      return;
    }
    scope.settled = true;
    releaseHold(scope);
    scopes.delete(scope);
    scope.settle?.(settlement);
    input.onScopeSettled?.({ operationId: scope.operationId, generation: scope.generation, settlement });
  };

  const publish = async (scope: ScopeState): Promise<void> => {
    try {
      const session = await openSession();
      await captureScopeGeneration(scope);
      if ((await liveGeneration()) !== scope.generation) {
        settleOnce(scope, emptySettlement('abandoned', 'stale-generation'));
        return;
      }
      const digests = [...scope.pending.keys()];
      if (digests.length === 0) {
        settleOnce(scope, emptySettlement('published'));
        return;
      }
      const controller = new AbortController();
      const exported = await scope.resident.exportEntries({ digests, signal: controller.signal });
      // Recheck the live generation after the asynchronous encode (D24, I7).
      if ((await liveGeneration()) !== scope.generation) {
        settleOnce(scope, emptySettlement('abandoned', 'stale-generation'));
        return;
      }
      const entries: ComputeStoreEntry[] = await Promise.all(
        exported.entries.map(async (entry) => ({
          action: entry.action,
          actionDigest: await digestAction({ action: entry.action }),
          contentDigest: await digestContent({ bytes: entry.bytes }),
          mediaType: entry.mediaType,
          bytes: entry.bytes,
          determinism: entry.determinism,
        })),
      );
      const result = await session.put({
        entries,
        discovery: scope.discovery,
        generation: scope.generation,
        durability: 'disposable',
      });
      if (result.status !== 'committed') {
        settleOnce(scope, {
          ...emptySettlement(result.status === 'stale-generation' ? 'abandoned' : 'failed', result.status),
          omitted: digests,
        });
        return;
      }
      settleOnce(scope, {
        status: 'published',
        published: result.published,
        omitted: exported.omitted,
        conflicts: result.conflicts,
      });
    } catch (error) {
      settleOnce(scope, {
        ...emptySettlement('failed', error instanceof Error ? error.message : String(error)),
      });
    }
  };

  const activate = (scope: ScopeState): void => {
    if (scope.outcome === 'open' || scope.settled || scope.running) {
      return;
    }
    if (scope.outcome !== 'delivered') {
      // A cancelled or failed operation never publishes (D24).
      settleOnce(scope, emptySettlement('abandoned', scope.outcome));
      return;
    }
    scope.running = true;
    const run = async (): Promise<void> => {
      try {
        await publish(scope);
      } finally {
        inFlight.delete(running);
      }
    };
    const running = run();
    inFlight.add(running);
  };

  const permitPublication = (): void => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- activate settles scopes, mutating the set.
    for (const scope of [...scopes]) {
      activate(scope);
    }
  };

  const openScope = (
    open: OpenComputeScopeInput,
    context: {
      readonly signal: AbortSignal;
      readonly operationId: string;
      readonly generationPromise: Promise<ComputeGeneration>;
    },
  ): ComputeReuseScope => {
    const { signal, operationId, generationPromise } = context;
    const generation = currentGeneration;
    const scope: ScopeState = {
      operationId,
      generation,
      generationPromise,
      generationCaptured: false,
      discovery: {
        namespace: open.namespace,
        producer: open.producer,
        environment: open.environment,
        ...(open.discovery === undefined ? {} : { hint: open.discovery }),
      },
      resident: open.resident,
      pending: new Map(),
      outcome: 'open',
      receipt: undefined,
      settle: undefined,
      settled: false,
      running: false,
    };
    scopes.add(scope);
    const floor = open.admissionFloor ?? defaultAdmissionFloor;

    const warm = async (request: ComputeWarmInput): Promise<ComputeWarmResult> => {
      try {
        const session = await openSession();
        await captureScopeGeneration(scope);
        const result = await session.get({
          digests: request.digests,
          discovery: scope.discovery,
          resident: request.digests.filter((digest) => scope.resident.contains({ digest })),
          maxEntries: request.maxEntries ?? defaultWarmEntries,
          maxBytes: request.maxBytes ?? defaultWarmBytes,
          generation: scope.generation,
          ...(request.signal ? { signal: request.signal } : { signal }),
        });
        // Recheck after the fetch and again after the import (hook contract step 2).
        if (result.status === 'stale-generation' || (await liveGeneration()) !== scope.generation) {
          return { status: 'stale-generation' };
        }
        const imported = await scope.resident.importEntries({
          entries: result.entries,
          signal: request.signal ?? signal,
        });
        const generation = await liveGeneration();
        if (generation !== scope.generation) {
          scope.resident.clear({ generation });
          return { status: 'stale-generation' };
        }
        let importedBytes = 0;
        for (const entry of result.entries) {
          importedBytes += entry.bytes.byteLength;
        }
        return {
          status: 'imported',
          imported: imported.imported,
          omitted: [...imported.omitted, ...result.omitted.map(({ digest }) => digest)],
          bytes: importedBytes,
        };
      } catch (error) {
        return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
      }
    };

    const announce = (request: { readonly entries: readonly ComputeAnnouncement[] }): ComputeAnnounceResult => {
      const admitted: ActionDigest[] = [];
      const rejected: Array<{ digest: ActionDigest; reason: 'below-floor' | 'duplicate' | 'pending-budget' }> = [];
      const now = Date.now();
      for (const entry of request.entries) {
        if (entry.kind !== 'action') {
          continue;
        }
        if (entry.computeDuration < floor) {
          rejected.push({ digest: entry.digest, reason: 'below-floor' });
          continue;
        }
        if (scope.pending.has(entry.digest)) {
          // Deduplicate before charging the budget (hook contract step 3).
          rejected.push({ digest: entry.digest, reason: 'duplicate' });
          continue;
        }
        if (pendingBytes + entry.estimatedBytes > maxPendingBytes || pendingEntries + 1 > maxPendingEntries) {
          // A full queue drops disposable work; it never backpressures the render.
          rejected.push({ digest: entry.digest, reason: 'pending-budget' });
          continue;
        }
        scope.pending.set(entry.digest, {
          digest: entry.digest,
          estimatedBytes: entry.estimatedBytes,
          announcedAt: now,
        });
        pendingBytes += entry.estimatedBytes;
        pendingEntries += 1;
        admitted.push(entry.digest);
      }
      return { admitted, rejected };
    };

    return {
      get generation() {
        return scope.generation;
      },
      warm,
      announce,
      close: ({ outcome }) => {
        if (scope.receipt) {
          // Closing twice returns the same receipt and never enqueues twice (U9).
          return scope.receipt;
        }
        scope.outcome = outcome;
        const receipt: ComputeScopeReceipt = {
          settled: new Promise<ComputeScopeSettlement>((resolve) => {
            scope.settle = resolve;
          }),
        };
        scope.receipt = receipt;
        return receipt;
      },
    };
  };

  const expireStaleHolds = (): void => {
    const now = Date.now();
    // oxlint-disable-next-line unicorn/no-useless-spread -- settleOnce deletes from the set.
    for (const scope of [...scopes]) {
      let oldest = now;
      for (const entry of scope.pending.values()) {
        oldest = Math.min(oldest, entry.announcedAt);
      }
      if (now - oldest > maxPendingAge) {
        settleOnce(scope, emptySettlement('abandoned', 'pending-age'));
      }
    }
  };

  const drain = async (options?: { readonly deadline?: number }): Promise<void> => {
    await bootstrap;
    expireStaleHolds();
    permitPublication();
    const deadline = options?.deadline ?? defaultDrainBudget;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        resolve('timeout');
      }, deadline);
    });
    try {
      const settleAll = async (): Promise<'done'> => {
        await Promise.allSettled(inFlight);
        return 'done';
      };
      const outcome = await Promise.race([settleAll(), expired]);
      if (outcome === 'timeout') {
        // oxlint-disable-next-line unicorn/no-useless-spread -- settleOnce deletes from the set.
        for (const scope of [...scopes]) {
          settleOnce(scope, emptySettlement('abandoned', 'drain-deadline'));
        }
      }
    } finally {
      // Cancel the timer rather than leaving dispose awaiting the same tail.
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const captureGeneration = async (): Promise<ComputeGeneration> => {
    if (generationObserved) {
      return liveGeneration();
    }
    const session = await openSession();
    currentGeneration = session.generation;
    generationObserved = true;
    return session.generation;
  };

  return {
    capability: (signal, operationId = 'unobserved') => {
      return {
        status: 'on',
        mode,
        evaluate: async (evaluation) => {
          const service = await openService();
          const digest = await digestAction({ action: evaluation.action });
          publications.set(digest, {
            action: evaluation.action,
            determinism: evaluation.codec.determinism ?? 'byte-exact',
          });
          try {
            return await service.evaluate({ ...evaluation, signal: evaluation.signal ?? signal });
          } finally {
            publications.delete(digest);
          }
        },
        openScope: (open) =>
          openScope(open, {
            signal,
            operationId,
            generationPromise: captureGeneration(),
          }),
      };
    },
    permitPublication,
    drain,
    dispose: async () => {
      await drain({ deadline: defaultDrainBudget });
      // oxlint-disable-next-line unicorn/no-useless-spread -- settleOnce deletes from the set.
      for (const scope of [...scopes]) {
        settleOnce(scope, emptySettlement('abandoned', 'disposed'));
      }
      if (sessionPromise) {
        const session = await sessionPromise;
        await session.close();
      }
    },
    control,
  };
};

/**
 * Mint an authorized retention owner for one required workload.
 * @param input - The owning job or checkpoint's diagnostic name.
 * @returns An opaque retention owner.
 * @internal
 */
export const _mintComputeRetention = (input: { readonly name: string }): CacheRetention =>
  ({ name: input.name }) as unknown as CacheRetention;
