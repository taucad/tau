import type { JobArtifactStore } from '#job-artifact-store.js';
import { createJobComputeReuseService } from '#job-compute-reuse.js';
import type {
  JobArtifactManifest,
  JobAttemptLease,
  JobDefinition,
  JobJsonObject,
  JobProgress,
  JobProviderExecutionOutcome,
} from '#job.types.js';

import type { ComputeReuseService } from '@taucad/cache-core';

/** Serializable metadata exposed by a job provider. @public */
export type JobProvider = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly types: readonly string[];
};

/** Runtime services supplied to one provider attempt. @public */
export type JobProviderRuntime = {
  readonly signal: AbortSignal;
  /** Owner-scoped deterministic compute reuse for this attempt. */
  readonly compute: ComputeReuseService;
  /**
   * Publish one bounded progress update.
   *
   * @param progress - Provider-owned phase and progress values.
   * @returns When the host has accepted the update.
   */
  emitProgress(progress: JobProgress): Promise<void>;
  /**
   * Persist one output through the host's content-addressed artifact store.
   *
   * @param input - Logical artifact metadata and owned bytes.
   * @returns The durable artifact manifest.
   */
  writeArtifact(input: {
    readonly role: string;
    readonly logicalPath: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
  }): Promise<JobArtifactManifest>;
};

/** Definition consumed by {@link defineJobProvider}. @public */
export type JobProviderDefinition<Options extends JobJsonObject = JobJsonObject> = JobProvider & {
  /**
   * Execute one immutable leased job definition.
   *
   * @param input - Attempt identity and provider-typed job definition.
   * @param runtime - Host-owned cancellation, progress, and artifact services.
   * @returns A discriminated terminal provider outcome.
   */
  execute(
    input: { readonly lease: Omit<JobAttemptLease, 'definition'> & { readonly definition: JobDefinition<Options> } },
    runtime: JobProviderRuntime,
  ): Promise<JobProviderExecutionOutcome>;
};

type ErasedJobProviderImplementation = {
  readonly execute: (
    input: { readonly lease: JobAttemptLease },
    runtime: JobProviderRuntime,
  ) => Promise<JobProviderExecutionOutcome>;
};

const implementationSymbol = Symbol('tau.jobs.provider.implementation');

type JobProviderWithImplementation = JobProvider & {
  readonly [implementationSymbol]?: ErasedJobProviderImplementation;
};

const isSafeLogicalPath = (path: string): boolean => {
  if (!path || path.startsWith('/') || path.includes('\\')) {
    return false;
  }
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

const assertProviderDefinition = (definition: JobProvider): void => {
  if (!definition.id.trim() || !definition.name.trim() || !definition.version.trim()) {
    throw new TypeError('defineJobProvider: id, name, and version must be non-empty strings.');
  }
  if (definition.types.length === 0 || definition.types.some((type) => !type.trim())) {
    throw new TypeError('defineJobProvider: types must contain at least one non-empty job type.');
  }
  if (new Set(definition.types).size !== definition.types.length) {
    throw new TypeError('defineJobProvider: types must not contain duplicates.');
  }
};

/**
 * Define a host-executed job provider while exposing only plain serializable metadata.
 *
 * @param definition - Provider metadata and its host-owned execution implementation.
 * @returns Frozen provider metadata carrying a non-enumerable host implementation.
 * @public
 *
 * @example <caption>Define a deterministic provider</caption>
 * ```typescript
 * import { defineJobProvider } from '@taucad/jobs';
 *
 * const echo = defineJobProvider({
 *   id: 'echo',
 *   name: 'Echo',
 *   version: '1.0.0',
 *   types: ['example.echo'],
 *   async execute({ lease }) {
 *     return { status: 'completed', artifacts: [], result: lease.definition.options };
 *   },
 * });
 * ```
 */
export const defineJobProvider = <Options extends JobJsonObject>(
  definition: JobProviderDefinition<Options>,
): JobProvider => {
  assertProviderDefinition(definition);
  const provider: JobProvider = {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    types: Object.freeze([...definition.types]),
  };
  const implementation: ErasedJobProviderImplementation = {
    async execute(input, runtime) {
      // The job type is checked by the host before execution; provider-owned options
      // are intentionally narrowed back to the author type at this single boundary.
      return definition.execute(
        {
          lease: {
            ...input.lease,
            definition: input.lease.definition as JobDefinition<Options>,
          },
        },
        runtime,
      );
    },
  };
  Object.defineProperty(provider, implementationSymbol, {
    value: implementation,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(provider);
};

/** Host facade that resolves providers and executes leased attempts. @public */
export type JobProviderHost = {
  /**
   * Execute one leased attempt against its declared provider type.
   *
   * @param input - Lease, cancellation signal, and durable progress sink.
   * @returns The provider's discriminated terminal outcome.
   */
  execute(input: {
    readonly lease: JobAttemptLease;
    readonly signal: AbortSignal;
    readonly onProgress: (progress: JobProgress) => Promise<void>;
  }): Promise<JobProviderExecutionOutcome>;
};

/**
 * Materialize host-side provider implementations for a runner process.
 *
 * @param options - Provider metadata/implementations and artifact storage.
 * @returns A host facade that executes matching leased attempts.
 * @public
 *
 * @example <caption>Execute a leased job on a host</caption>
 * ```typescript
 * import { createJobProviderHost } from '@taucad/jobs';
 * import type { JobArtifactStore, JobProvider } from '@taucad/jobs';
 *
 * declare const artifactStore: JobArtifactStore;
 * declare const provider: JobProvider;
 * const host = createJobProviderHost({ providers: [provider], artifactStore });
 * ```
 */
export const createJobProviderHost = (options: {
  readonly providers: readonly JobProvider[];
  readonly artifactStore: JobArtifactStore;
}): JobProviderHost => {
  const byType = new Map<string, JobProvider>();
  for (const provider of options.providers) {
    for (const type of provider.types) {
      if (byType.has(type)) {
        throw new TypeError(`createJobProviderHost: duplicate provider for job type ${JSON.stringify(type)}.`);
      }
      byType.set(type, provider);
    }
  }

  return {
    async execute(input) {
      const provider = byType.get(input.lease.definition.type);
      if (!provider) {
        return {
          status: 'failed',
          failure: {
            code: 'PROVIDER_NOT_FOUND',
            message: `No provider is registered for job type ${JSON.stringify(input.lease.definition.type)}.`,
            retryable: false,
          },
        };
      }
      const implementation = (provider as JobProviderWithImplementation)[implementationSymbol];
      if (!implementation) {
        return {
          status: 'failed',
          failure: {
            code: 'INVALID_PROVIDER',
            message: `Provider ${JSON.stringify(provider.id)} was not created by defineJobProvider.`,
            retryable: false,
          },
        };
      }
      let artifactOrdinal = 0;
      const runtime: JobProviderRuntime = {
        signal: input.signal,
        compute: createJobComputeReuseService({
          artifactStore: options.artifactStore,
          attempt: {
            jobId: input.lease.jobId,
            attemptId: input.lease.attemptId,
            attempt: input.lease.attempt,
            runnerId: input.lease.runnerId,
          },
        }),
        emitProgress: input.onProgress,
        async writeArtifact(artifactInput) {
          if (!artifactInput.role.trim() || !artifactInput.mediaType.trim()) {
            throw new TypeError('Job artifacts require non-empty role and mediaType values.');
          }
          if (!isSafeLogicalPath(artifactInput.logicalPath)) {
            throw new TypeError(`Job artifact logicalPath is not a safe relative path: ${artifactInput.logicalPath}`);
          }
          artifactOrdinal += 1;
          const artifactId = `${input.lease.attemptId}:artifact:${String(artifactOrdinal)}`;
          const stored = await options.artifactStore.put({
            bytes: artifactInput.bytes,
            mediaType: artifactInput.mediaType,
            attempt: {
              jobId: input.lease.jobId,
              attemptId: input.lease.attemptId,
              attempt: input.lease.attempt,
              runnerId: input.lease.runnerId,
            },
          });
          return {
            ...stored,
            artifactId,
            role: artifactInput.role,
            logicalPath: artifactInput.logicalPath,
            mediaType: artifactInput.mediaType,
            provenance: {
              jobId: input.lease.jobId,
              attemptId: input.lease.attemptId,
              attempt: input.lease.attempt,
              runnerId: input.lease.runnerId,
              providerId: provider.id,
              providerVersion: provider.version,
              inputDigest: input.lease.definition.input.digest,
            },
          };
        },
      };
      try {
        return await implementation.execute({ lease: input.lease }, runtime);
      } catch (error) {
        if (input.signal.aborted) {
          return { status: 'cancelled', reason: String(input.signal.reason ?? 'cancelled') };
        }
        return {
          status: 'failed',
          failure: {
            code: 'PROVIDER_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        };
      }
    },
  };
};
