import {
  CacheCorruptionError,
  createComputeReuseService,
  createMemoryActionStore,
  createMemoryContentStore,
  unsupportedCacheMaintenance,
} from '@taucad/cache-core';
import type { ActionStore, ComputeReuseService, ContentStore } from '@taucad/cache-core';

import type { JobArtifactStore } from '#job-artifact-store.js';
import type { JobAttemptIdentity } from '#job.types.js';

type JobComputeStores = {
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
};

const createArtifactContentStore = (input: {
  readonly artifactStore: JobArtifactStore;
  readonly attempt: JobAttemptIdentity;
}): ContentStore => ({
  async read({ digest }) {
    const outcome = await input.artifactStore.read({ digest, attempt: input.attempt });
    return outcome.found ? { status: 'hit', bytes: outcome.bytes } : { status: 'miss' };
  },
  async write({ digest, bytes }) {
    const outcome = await input.artifactStore.put({
      bytes,
      mediaType: 'application/octet-stream',
      attempt: input.attempt,
    });
    if (outcome.digest !== digest) {
      throw new CacheCorruptionError('Job artifact storage returned a different content digest.');
    }
    return { status: 'stored' };
  },
  maintenance: unsupportedCacheMaintenance,
});

const createArtifactActionStore = (input: {
  readonly artifactStore: JobArtifactStore;
  readonly attempt: JobAttemptIdentity;
}): ActionStore => {
  if (input.artifactStore.computeReuse.status !== 'supported') {
    return createMemoryActionStore({ maxBytes: Number.MAX_SAFE_INTEGER });
  }
  const capability = input.artifactStore.computeReuse;
  return {
    async read({ digest }) {
      return capability.readAction({ digest, attempt: input.attempt });
    },
    async publish({ record }) {
      return capability.publishAction({ record, attempt: input.attempt });
    },
    maintenance: unsupportedCacheMaintenance,
  };
};

/**
 * Build the cache-core store views authorized for one job attempt.
 * @param input - Artifact store and the attempt authority applied to every operation.
 * @returns Content and action store views scoped to that attempt.
 * @internal
 */
export const createJobComputeStores = (input: {
  readonly artifactStore: JobArtifactStore;
  readonly attempt: JobAttemptIdentity;
}): JobComputeStores => {
  if (input.artifactStore.computeReuse.status === 'unsupported') {
    return {
      contentStore: createMemoryContentStore({ maxBytes: Number.MAX_SAFE_INTEGER }),
      actionStore: createMemoryActionStore({ maxBytes: Number.MAX_SAFE_INTEGER }),
    };
  }
  return {
    contentStore: createArtifactContentStore(input),
    actionStore: createArtifactActionStore(input),
  };
};

/**
 * Create the always-present compute service scoped to one host-authorized attempt.
 * @param input - Authorized attempt identity and its artifact store.
 * @returns An attempt-scoped compute service.
 * @internal
 */
export const createJobComputeReuseService = (input: {
  readonly artifactStore: JobArtifactStore;
  readonly attempt: JobAttemptIdentity;
}): ComputeReuseService => {
  return createComputeReuseService(createJobComputeStores(input));
};
