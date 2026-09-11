import type { JobAttemptIdentity } from '#job.types.js';

import {
  CacheCorruptionError,
  createMemoryActionStore,
  createMemoryContentStore,
  digestContent,
} from '@taucad/cache-core';
import type { ActionDigest, CacheRejectionReason, ComputeActionRecord, ContentDigest } from '@taucad/cache-core';

/** Maximum immutable artifact size accepted by Tau job data planes. @public */
export const maximumJobArtifactBytes = 1024 * 1024 * 1024;

/** Maximum serialized action-record size accepted by Tau job data planes. @public */
export const maximumJobActionRecordBytes = 64 * 1024;

const maximumMemoryJobActionCacheBytes = 64 * 1024 * 1024;

/** Validated immutable action record stored under job authority. @public */
export type JobComputeActionRecord = ComputeActionRecord;

/** Input for publishing one immutable job artifact. @public */
export type JobArtifactPutInput = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: string;
  /** Attempt that owns the write when the backing store enforces remote authorization. */
  readonly attempt?: JobAttemptIdentity;
};

/** Input for reading one immutable job artifact. @public */
export type JobArtifactReadInput = {
  readonly digest: `sha256:${string}`;
  /** Attempt that owns the read when the backing store enforces remote authorization. */
  readonly attempt?: JobAttemptIdentity;
};

/** Input for resolving an owner-scoped deterministic action. @public */
export type JobActionReadInput = {
  readonly digest: ActionDigest;
  readonly attempt: JobAttemptIdentity;
};

/** Input for publishing an owner-scoped deterministic action. @public */
export type JobActionPublishInput = {
  readonly record: ComputeActionRecord;
  readonly attempt: JobAttemptIdentity;
};

/** Owner-scoped action-record storage used by the job compute service. @public */
export type JobArtifactComputeReuseCapability =
  | {
      readonly status: 'supported';
      readonly readAction: (
        input: JobActionReadInput,
      ) => Promise<{ readonly status: 'hit'; readonly record: ComputeActionRecord } | { readonly status: 'miss' }>;
      readonly publishAction: (
        input: JobActionPublishInput,
      ) => Promise<
        | { readonly status: 'published' | 'existing' }
        | { readonly status: 'rejected'; readonly reason: CacheRejectionReason }
      >;
    }
  | { readonly status: 'unsupported'; readonly reason: string };

/**
 * Content-addressed artifact storage used by provider hosts.
 *
 * @public
 */
export type JobArtifactStore = {
  /** Required capability facet for durable deterministic stage records. */
  readonly computeReuse: JobArtifactComputeReuseCapability;
  /**
   * Persist owned bytes by SHA-256 digest.
   *
   * @param input - Artifact bytes to hash and store.
   * @returns The stable digest, byte length, and backing-store key.
   */
  put(input: JobArtifactPutInput): Promise<{
    readonly digest: `sha256:${string}`;
    readonly size: number;
    readonly storageKey: string;
  }>;
  /**
   * Read a defensive copy of one stored artifact.
   *
   * @param input - Content digest to retrieve.
   * @returns A discriminated found or missing outcome.
   */
  read(input: JobArtifactReadInput): Promise<JobArtifactReadOutcome>;
};

/** Outcome from reading a content-addressed artifact. @public */
export type JobArtifactReadOutcome =
  | { readonly found: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly found: false; readonly reason: 'not-found' };

const ownerKey = (attempt: JobAttemptIdentity): string => attempt.jobId;

const addOwner = <Digest extends string>(owners: Map<Digest, Set<string>>, digest: Digest, owner: string): void => {
  const existing = owners.get(digest);
  if (existing === undefined) {
    owners.set(digest, new Set([owner]));
    return;
  }
  existing.add(owner);
};

const owns = <Digest extends string>(owners: Map<Digest, Set<string>>, digest: Digest, owner: string): boolean =>
  owners.get(digest)?.has(owner) ?? false;

/**
 * Create an isolated in-memory content-addressed artifact store.
 * This reference store is deterministic and intended for tests, spikes, and local conformance only.
 *
 * @returns A new defensive-copying artifact store.
 * @public
 *
 * @example <caption>Store and recover artifact bytes</caption>
 * ```typescript
 * import { createMemoryJobArtifactStore } from '@taucad/jobs';
 *
 * const store = createMemoryJobArtifactStore();
 * void store.put({ bytes: new TextEncoder().encode('result'), mediaType: 'text/plain' });
 * ```
 */
export const createMemoryJobArtifactStore = (): JobArtifactStore => {
  const content = createMemoryContentStore({ maxBytes: maximumJobArtifactBytes });
  const actions = createMemoryActionStore({
    maxBytes: maximumMemoryJobActionCacheBytes,
    maxEntryBytes: maximumJobActionRecordBytes,
  });
  const contentOwners = new Map<ContentDigest, Set<string>>();
  const actionOwners = new Map<ActionDigest, Set<string>>();

  return {
    async put({ bytes, attempt }) {
      const digest = await digestContent({ bytes });
      const published = await content.write({ digest, bytes });
      if (published.status === 'rejected') {
        throw new Error('The in-memory job artifact store rejected an artifact.');
      }
      if (attempt !== undefined) {
        addOwner(contentOwners, digest, ownerKey(attempt));
      }
      return { digest, size: bytes.byteLength, storageKey: digest };
    },
    async read({ digest, attempt }) {
      const contentKey = digest as ContentDigest;
      if (attempt !== undefined && !owns(contentOwners, contentKey, ownerKey(attempt))) {
        return { found: false, reason: 'not-found' };
      }
      const result = await content.read({ digest: contentKey });
      return result.status === 'hit' ? { found: true, bytes: result.bytes } : { found: false, reason: 'not-found' };
    },
    computeReuse: {
      status: 'supported',
      async readAction({ digest, attempt }) {
        if (!owns(actionOwners, digest, ownerKey(attempt))) {
          return { status: 'miss' };
        }
        return actions.read({ digest });
      },
      async publishAction({ record, attempt }) {
        const owner = ownerKey(attempt);
        if (!owns(contentOwners, record.output.digest, owner)) {
          throw new CacheCorruptionError('A job action cannot publish before its output content is owned.');
        }
        if (record.dependencies.some((dependency) => !owns(actionOwners, dependency, owner))) {
          throw new CacheCorruptionError('A job action cannot reference an unavailable owner-scoped dependency.');
        }
        const outcome = await actions.publish({ record });
        if (outcome.status !== 'rejected') {
          addOwner(actionOwners, record.actionDigest, owner);
        }
        return outcome;
      },
    },
  };
};
