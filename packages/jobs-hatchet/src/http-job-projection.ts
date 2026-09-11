import type { JobAttemptIdentity } from '@taucad/jobs';
import type { HatchetJobProjection, HatchetJobProjectionMutationOutcome } from '#hatchet-job-task.js';

const projectionOutcome = (value: unknown): HatchetJobProjectionMutationOutcome => {
  if (typeof value !== 'object' || value === null || !('accepted' in value) || typeof value.accepted !== 'boolean') {
    throw new TypeError('Tau job projection returned a malformed mutation outcome.');
  }
  if (value.accepted) {
    return { accepted: true };
  }
  if (!('reason' in value) || typeof value.reason !== 'string') {
    throw new TypeError('Tau job projection rejection omitted its reason.');
  }
  return { accepted: false, reason: value.reason };
};

/**
 * Connect a Hatchet worker attempt to Tau's authenticated durable projection API.
 *
 * @param options - Tau API origin, paired-agent credential, and optional fetch implementation.
 * @returns Projection sink consumed by {@link defineHatchetJobTask}.
 * @public
 */
export const createHttpHatchetJobProjection = (options: {
  readonly apiUrl: string;
  readonly credential: string;
  readonly fetch?: typeof globalThis.fetch;
}): HatchetJobProjection => {
  const baseUrl = new URL(options.apiUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!options.credential) {
    throw new TypeError('createHttpHatchetJobProjection: credential must be non-empty.');
  }

  const request = async (
    identity: JobAttemptIdentity,
    operation: 'start' | 'heartbeat' | 'progress' | 'retrying' | 'finish',
    payload: Record<string, unknown>,
  ): Promise<HatchetJobProjectionMutationOutcome> => {
    const url = new URL(`/v1/jobs/${encodeURIComponent(identity.jobId)}/attempts/${operation}`, baseUrl);
    const response = await fetchImplementation(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.credential}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId: identity.attemptId,
        attempt: identity.attempt,
        ...payload,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Tau job projection ${operation} failed with HTTP ${String(response.status)}.`);
    }
    return projectionOutcome(await response.json());
  };

  return Object.freeze({
    attemptStarted: async (input) =>
      request(input, 'start', {
        workflowRunId: input.workflowRunId,
        definitionDigest: input.definitionDigest,
      }),
    heartbeat: async (input) => request(input, 'heartbeat', {}),
    progress: async (input) => request(input, 'progress', { progress: input.progress }),
    retrying: async (input) => request(input, 'retrying', { outcome: input.outcome }),
    finished: async (input) => request(input, 'finish', { outcome: input.outcome }),
  });
};
