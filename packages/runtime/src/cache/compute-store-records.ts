/**
 * Record validation and naming shared by every compute store engine.
 *
 * The authority recomputes canonical identity before it trusts a record:
 * verifying only the payload hash would sign a falsely labelled action, so a
 * planted record can never reach a hit (U20). Every engine validates through
 * this one function, so memory, SQLite and IndexedDB cannot drift apart on what
 * they will admit.
 */

import { canonicalizeCacheValue, digestAction, digestContent } from '@taucad/cache-core';
import type { ActionDigest, ContentDigest } from '@taucad/cache-core';
import type {
  ComputeDiscoveryContext,
  ComputeGetInput,
  ComputePutInput,
  ComputeStoreEntry,
} from '#types/runtime-compute.types.js';

const maximumDiscoveryKeyLength = 64 * 1024;
const maximumGetDigests = 4096;

/** Maximum indexed discovery candidates examined by one bounded fetch. @internal */
export const maximumDiscoveryCandidates = maximumGetDigests;

/**
 * Canonical index key for authorized peer discovery.
 * @param context - Scope identity and optional hint.
 * @returns A stable index key.
 * @internal
 */
export const computeDiscoveryKey = (context: ComputeDiscoveryContext): string => {
  const key = canonicalizeCacheValue({ value: context });
  if (key.length > maximumDiscoveryKeyLength) {
    throw new TypeError('Compute discovery context exceeds 64 KiB.');
  }
  return key;
};

/** Validate public fetch bounds before an engine performs storage work. @internal */
export const validateComputeGetInput = (input: ComputeGetInput): void => {
  if (!Number.isSafeInteger(input.maxEntries) || input.maxEntries <= 0) {
    throw new TypeError('maxEntries must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer.');
  }
  if (input.digests.length > maximumGetDigests || (input.resident?.length ?? 0) > maximumGetDigests) {
    throw new TypeError('Compute fetch identity lists may contain at most 4096 entries.');
  }
};

/** Validate public publication bounds before hashing or storage work. @internal */
export const validateComputePutInput = (input: ComputePutInput): void => {
  if (input.entries.length > maximumGetDigests) {
    throw new TypeError('Compute publication batches may contain at most 4096 entries.');
  }
  if (input.discovery) {
    computeDiscoveryKey(input.discovery);
  }
};

/**
 * A validated entry and the payload references its storage closure requires.
 *
 * D28/I21: only `requiredContent` explicitly declares mandatory storage
 * closure. Producer assets, content inputs, and semantic action ancestry remain
 * identity metadata, so a self-contained result stays a hit without them.
 * @internal
 */
export type ValidatedComputeEntry = {
  readonly entry: ComputeStoreEntry;
  readonly dependencies: readonly ContentDigest[];
};

/**
 * Recompute an entry's canonical identity and collect its required closure.
 *
 * @param entry - The candidate record as its producer labelled it.
 * @returns The validated entry, or `undefined` when a label does not match the
 *   bytes it claims to name.
 * @internal
 */
export const validateComputeEntry = async (entry: ComputeStoreEntry): Promise<ValidatedComputeEntry | undefined> => {
  try {
    if ((await digestAction({ action: entry.action })) !== entry.actionDigest) {
      return undefined;
    }
  } catch {
    // A structurally invalid action cannot be canonicalized, so it is not a record.
    return undefined;
  }
  if ((await digestContent({ bytes: entry.bytes })) !== entry.contentDigest) {
    return undefined;
  }
  return {
    entry,
    dependencies: [...new Set(entry.requiredContent ?? [])],
  };
};

/** Collapse byte-for-byte equivalent storage records after dependency normalization. @internal */
export const normalizeValidatedComputeEntries = (
  entries: readonly ValidatedComputeEntry[],
): readonly ValidatedComputeEntry[] => {
  const seen = new Set<string>();
  return entries.filter(({ entry, dependencies }) => {
    const identity = JSON.stringify([
      entry.actionDigest,
      entry.contentDigest,
      entry.mediaType,
      entry.determinism,
      [...dependencies].sort(),
    ]);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
};

/** Action identities carrying more than one normalized record in one batch. @internal */
export const divergentComputeActions = (entries: readonly ValidatedComputeEntry[]): ReadonlySet<ActionDigest> => {
  const first = new Map<string, ValidatedComputeEntry>();
  const divergent = new Set<ActionDigest>();
  for (const candidate of entries) {
    const prior = first.get(candidate.entry.actionDigest);
    if (prior === undefined) {
      first.set(candidate.entry.actionDigest, candidate);
    } else {
      divergent.add(candidate.entry.actionDigest);
    }
  }
  return divergent;
};

/**
 * Map a workspace key to an opaque storage name.
 *
 * The host's workspace key may contain a project path; a database file or name
 * derived from it must not (I3, D9), so it is reduced to a digest with no
 * algorithm prefix and no separator that a filesystem would reject.
 *
 * @param workspace - The host's workspace key.
 * @returns 32 lowercase hex characters.
 * @internal
 */
export const opaqueWorkspaceName = async (workspace: string): Promise<string> => {
  const digest = await digestContent({
    bytes: new TextEncoder().encode(workspace),
  });
  return (digest.split(':').at(-1) ?? digest).slice(0, 32);
};
