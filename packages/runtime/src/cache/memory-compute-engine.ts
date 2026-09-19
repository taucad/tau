/**
 * In-worker memory compute store engine.
 *
 * The library default (EQ13): one map per workspace, opened on the identical
 * code path a durable engine uses, so `memory` needs no host wiring. It is
 * explicitly not durable — every required promotion is refused with
 * `no-durable-storage` rather than falsely acknowledged (D8, I12).
 *
 * Browser IndexedDB and native SQLite engines land in W2 behind these exact
 * types.
 */

import type { ActionDigest } from '@taucad/cache-core';
import {
  computeDiscoveryKey,
  divergentComputeActions,
  maximumDiscoveryCandidates,
  normalizeValidatedComputeEntries,
  validateComputeEntry,
  validateComputeGetInput,
  validateComputePutInput,
} from '#cache/compute-store-records.js';
import type {
  ComputeGeneration,
  ComputeGetInput,
  ComputeGetResult,
  ComputePinInput,
  ComputePinResult,
  ComputePutInput,
  ComputePutResult,
  ComputeReleaseInput,
  ComputeStoreControl,
  ComputeStoreEngine,
  ComputeStoreEntry,
  ComputeStoreReport,
  ComputeStoreSession,
} from '#types/runtime-compute.types.js';
import type { ValidatedComputeEntry } from '#cache/compute-store-records.js';

const asGeneration = (value: number): ComputeGeneration => value as ComputeGeneration;

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

type Workspace = {
  generation: ComputeGeneration;
  readonly entries: Map<ActionDigest, ComputeStoreEntry>;
  /** Byte-exact digests whose producers disagreed. Retired by the next clear (EQ18). */
  readonly poisoned: Set<ActionDigest>;
  readonly discovery: Map<string, Set<ActionDigest>>;
  bytes: number;
};

/** A memory engine plus its authority control facet. @public */
export type MemoryComputeEngine = {
  readonly engine: ComputeStoreEngine;
  readonly control: (input: { readonly workspace: string }) => ComputeStoreControl;
};

/**
 * Create one process-local memory compute engine.
 * @returns The engine and its authority control facet.
 * @public
 */
export const createMemoryComputeEngine = (): MemoryComputeEngine => {
  const workspaces = new Map<string, Workspace>();
  const resolve = (name: string): Workspace => {
    const existing = workspaces.get(name);
    if (existing) {
      return existing;
    }
    const created: Workspace = {
      generation: asGeneration(1),
      entries: new Map(),
      poisoned: new Set(),
      discovery: new Map(),
      bytes: 0,
    };
    workspaces.set(name, created);
    return created;
  };

  const open = async (input: {
    readonly workspace: string;
    readonly signal?: AbortSignal;
  }): Promise<ComputeStoreSession> => {
    input.signal?.throwIfAborted();
    const workspace = resolve(input.workspace);
    const opened = workspace.generation;
    let closed = false;
    const assertOpen = (): void => {
      if (closed) {
        throw new Error('This compute store session is closed.');
      }
    };
    const session: ComputeStoreSession = {
      generation: opened,
      durable: false,
      get: async (request: ComputeGetInput): Promise<ComputeGetResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        validateComputeGetInput(request);
        if (request.generation !== workspace.generation) {
          return { status: 'stale-generation', generation: workspace.generation };
        }
        const resident = new Set(request.resident ?? []);
        const entries: ComputeStoreEntry[] = [];
        const omitted: Array<{ digest: ActionDigest; reason: 'missing' | 'poisoned' | 'budget' }> = [];
        let bytes = 0;
        const candidates = request.discovery
          ? [...(workspace.discovery.get(computeDiscoveryKey(request.discovery)) ?? [])].slice(
              0,
              maximumDiscoveryCandidates,
            )
          : [];
        for (const digest of new Set([...request.digests, ...candidates])) {
          if (resident.has(digest)) {
            continue;
          }
          if (workspace.poisoned.has(digest)) {
            omitted.push({ digest, reason: 'poisoned' });
            continue;
          }
          const entry = workspace.entries.get(digest);
          if (!entry) {
            omitted.push({ digest, reason: 'missing' });
            continue;
          }
          if (entries.length >= request.maxEntries || bytes + entry.bytes.byteLength > request.maxBytes) {
            omitted.push({ digest, reason: 'budget' });
            continue;
          }
          entries.push({ ...entry, bytes: new Uint8Array(entry.bytes) });
          bytes += entry.bytes.byteLength;
        }
        return { status: 'ok', entries, omitted };
      },
      put: async (request: ComputePutInput): Promise<ComputePutResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        validateComputePutInput(request);
        if (request.durability === 'required') {
          return { status: 'no-durable-storage' };
        }
        if (request.generation !== workspace.generation) {
          return { status: 'stale-generation', generation: workspace.generation };
        }
        const published: ActionDigest[] = [];
        const conflicts: Array<{ digest: ActionDigest; outcome: 'poisoned' | 'first-writer-retained' }> = [];
        // The authority recomputes canonical identity before it trusts a
        // record, on every engine: a falsely labelled action never reaches a
        // hit here either (U20).
        const records: ValidatedComputeEntry[] = [];
        for (const candidate of request.entries) {
          // oxlint-disable-next-line no-await-in-loop -- validation order is the batch's order.
          const valid = await validateComputeEntry(candidate);
          if (valid) {
            records.push(valid);
          }
        }
        const validated = normalizeValidatedComputeEntries(records).map(({ entry }) => entry);
        const divergent = divergentComputeActions(normalizeValidatedComputeEntries(records));
        const poisonedBatchActions = new Set<ActionDigest>();
        for (const digest of divergent) {
          if (validated.some((entry) => entry.actionDigest === digest && entry.determinism === 'byte-exact')) {
            poisonedBatchActions.add(digest);
            const existing = workspace.entries.get(digest);
            if (existing) {
              workspace.entries.delete(digest);
              workspace.bytes -= existing.bytes.byteLength;
            }
            workspace.poisoned.add(digest);
            conflicts.push({ digest, outcome: 'poisoned' });
          }
        }
        const availableContent = new Set([...workspace.entries.values()].map(({ contentDigest }) => contentDigest));
        const candidates = validated.filter((entry) => {
          if (poisonedBatchActions.has(entry.actionDigest)) {
            return false;
          }
          if (workspace.poisoned.has(entry.actionDigest)) {
            return false;
          }
          const existing = workspace.entries.get(entry.actionDigest);
          return existing === undefined || equalBytes(existing.bytes, entry.bytes);
        });
        const publishable: ComputeStoreEntry[] = [];
        const produced = new Set<ComputeStoreEntry['contentDigest']>();
        const accepted = new Set<ActionDigest>();
        let changed = true;
        while (changed) {
          changed = false;
          for (const entry of candidates) {
            if (
              !accepted.has(entry.actionDigest) &&
              (entry.requiredContent ?? []).every(
                (dependency) => availableContent.has(dependency) || produced.has(dependency),
              )
            ) {
              publishable.push(entry);
              accepted.add(entry.actionDigest);
              produced.add(entry.contentDigest);
              changed = true;
            }
          }
        }
        const handledEquivalentBatchActions = new Set<ActionDigest>();
        for (const entry of validated) {
          if (poisonedBatchActions.has(entry.actionDigest)) {
            continue;
          }
          if (divergent.has(entry.actionDigest)) {
            if (handledEquivalentBatchActions.has(entry.actionDigest)) {
              continue;
            }
            handledEquivalentBatchActions.add(entry.actionDigest);
            conflicts.push({ digest: entry.actionDigest, outcome: 'first-writer-retained' });
          }
          if (
            (entry.requiredContent ?? []).some(
              (dependency) => !availableContent.has(dependency) && !produced.has(dependency),
            )
          ) {
            continue;
          }
          if (workspace.poisoned.has(entry.actionDigest)) {
            conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
            continue;
          }
          const existing = workspace.entries.get(entry.actionDigest);
          if (existing && !equalBytes(existing.bytes, entry.bytes)) {
            // I6: publish-once is never last-writer-wins.
            if (entry.determinism === 'equivalent') {
              conflicts.push({ digest: entry.actionDigest, outcome: 'first-writer-retained' });
              continue;
            }
            workspace.entries.delete(entry.actionDigest);
            workspace.bytes -= existing.bytes.byteLength;
            workspace.poisoned.add(entry.actionDigest);
            for (const discovered of workspace.discovery.values()) {
              discovered.delete(entry.actionDigest);
            }
            conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
            continue;
          }
          if (!existing) {
            workspace.entries.set(entry.actionDigest, { ...entry, bytes: new Uint8Array(entry.bytes) });
            workspace.bytes += entry.bytes.byteLength;
          }
          published.push(entry.actionDigest);
          if (request.discovery) {
            const key = computeDiscoveryKey(request.discovery);
            const index = workspace.discovery.get(key) ?? new Set<ActionDigest>();
            index.add(entry.actionDigest);
            workspace.discovery.set(key, index);
          }
        }
        // The honest entries of a conflicting batch still commit (U23).
        return { status: 'committed', published, conflicts };
      },
      pin: async (request: ComputePinInput): Promise<ComputePinResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        // Memory cannot claim required durability (D8, I12).
        return { status: 'no-durable-storage' };
      },
      release: async (request: ComputeReleaseInput): Promise<{ readonly status: 'released' }> => {
        request.signal?.throwIfAborted();
        return { status: 'released' };
      },
      close: async () => {
        closed = true;
      },
    };
    return session;
  };

  return {
    engine: { open },
    control: ({ workspace: name }) => {
      const workspace = resolve(name);
      return {
        inspect: async ({ signal }): Promise<ComputeStoreReport> => {
          signal?.throwIfAborted();
          return {
            entries: workspace.entries.size,
            logicalBytes: workspace.bytes,
            pinnedBytes: 0,
            pendingBytes: 0,
            generation: workspace.generation,
            physicalBytes: { status: 'unsupported' },
          };
        },
        clear: async ({ signal }) => {
          signal?.throwIfAborted();
          workspace.entries.clear();
          workspace.poisoned.clear();
          workspace.discovery.clear();
          workspace.bytes = 0;
          workspace.generation = asGeneration(workspace.generation + 1);
          // Memory holds no required roots, so nothing is retained (D26).
          return { status: 'cleared', generation: workspace.generation, retained: 0 };
        },
        collect: async ({ signal }) => {
          signal?.throwIfAborted();
          return { status: 'complete', reclaimed: 0 };
        },
      };
    },
  };
};
