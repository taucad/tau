import { defineJobProvider } from '#job-provider.js';
import type { JobProvider } from '#job-provider.js';
import type { JobJsonObject } from '#job.types.js';

/** Stable job type executed by the deterministic conformance provider. @public */
export const jobConformanceType = 'tau.conformance.echo';

type ConformanceOptions = JobJsonObject & {
  readonly message: string;
};

/**
 * Create a deterministic provider for coordinator, host, and artifact-store conformance tests.
 * The provider emits one progress record and writes the UTF-8 `message` option to `result.txt`.
 *
 * @returns Provider metadata backed by a deterministic host implementation.
 * @public
 *
 * @example <caption>Register the conformance provider</caption>
 * ```typescript
 * import { createJobConformanceProvider, createJobProviderHost } from '@taucad/jobs';
 * import type { JobArtifactStore } from '@taucad/jobs';
 *
 * declare const artifactStore: JobArtifactStore;
 * const provider = createJobConformanceProvider();
 * const host = createJobProviderHost({ providers: [provider], artifactStore });
 * ```
 */
export const createJobConformanceProvider = (): JobProvider =>
  defineJobProvider<ConformanceOptions>({
    id: 'tau.conformance',
    name: 'Tau deterministic conformance provider',
    version: '1.0.0',
    types: [jobConformanceType],
    async execute({ lease }, runtime) {
      const { message } = lease.definition.options;
      await runtime.emitProgress({
        phase: 'echo',
        completed: 1,
        total: 1,
        message,
      });
      const artifact = await runtime.writeArtifact({
        role: 'result',
        logicalPath: 'result.txt',
        mediaType: 'text/plain',
        bytes: new TextEncoder().encode(message),
      });
      return { status: 'completed', artifacts: [artifact], result: { echoed: message } };
    },
  });
