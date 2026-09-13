import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { IdempotencyCollisionError } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { HatchetClient, TaskWorkflowDeclaration } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type {
  JobAttemptIdentity,
  JobDefinition,
  JobProgress,
  JobProviderExecutionOutcome,
  JobProviderHost,
} from '@taucad/jobs';
import { toHatchetDesiredWorkerLabels } from '#hatchet-job-routing.js';
import { hatchetOwnerAffinityLabel, hatchetPoolAffinityLabel } from '#hatchet-runtime-affinity.js';
import type { HatchetJobRuntimeAffinity } from '#hatchet-runtime-affinity.js';

/** Immutable Tau job payload admitted to Hatchet. @public */
export type HatchetJobSubmission = {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly definitionDigest: `sha256:${string}`;
  readonly definition: JobDefinition;
};

type MutableJson<Value> =
  Value extends ReadonlyArray<infer Item>
    ? Array<MutableJson<Item>>
    : // oxlint-disable-next-line typescript/no-restricted-types -- recursive mapped type must include named object shapes without index signatures.
      Value extends object
      ? { -readonly [Key in keyof Value]: MutableJson<Value[Key]> }
      : Value;

type HatchetJobInput = MutableJson<HatchetJobSubmission>;

/** Compact terminal value retained by Hatchet for one Tau attempt. @public */
export type HatchetJobTaskOutput = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly attempt: number;
  readonly runnerId: string;
  readonly state: 'completed' | 'failed' | 'cancelled' | 'stale';
};

/** Result of fencing a Hatchet attempt mutation in Tau's durable projection. @public */
export type HatchetJobProjectionMutationOutcome =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

/** Durable Tau projection sink called from a Hatchet worker attempt. @public */
export type HatchetJobProjection = {
  attemptStarted(
    input: JobAttemptIdentity & {
      readonly workflowRunId: string;
      readonly definitionDigest: `sha256:${string}`;
    },
  ): Promise<HatchetJobProjectionMutationOutcome>;
  progress(
    input: JobAttemptIdentity & {
      readonly progress: JobProgress;
    },
  ): Promise<HatchetJobProjectionMutationOutcome>;
  heartbeat(input: JobAttemptIdentity): Promise<HatchetJobProjectionMutationOutcome>;
  retrying(
    input: JobAttemptIdentity & {
      readonly outcome: Extract<JobProviderExecutionOutcome, { readonly status: 'failed' }>;
    },
  ): Promise<HatchetJobProjectionMutationOutcome>;
  finished(
    input: JobAttemptIdentity & {
      readonly outcome: JobProviderExecutionOutcome;
    },
  ): Promise<HatchetJobProjectionMutationOutcome>;
};

/** Static Hatchet registration values shared by compatible Tau jobs. @public */
export type HatchetJobTaskProfile = {
  readonly name: string;
  readonly slotCost: number;
  readonly maxAttempts: number;
  readonly executionTimeout: `${number}${'s' | 'm' | 'h'}`;
  readonly scheduleTimeout: `${number}${'s' | 'm' | 'h'}`;
  /** Hatchet idempotency fallback window in milliseconds. */
  readonly idempotencyTtl: number;
};

/**
 * Derive the one stable Hatchet registration profile for a Tau definition.
 * Workers and submitters use this function so static Hatchet slot/retry values cannot drift.
 *
 * @param definition - Immutable Tau job definition.
 * @returns Deterministic Hatchet task identity and execution limits.
 * @public
 */
export const createHatchetJobTaskProfile = (definition: JobDefinition): HatchetJobTaskProfile => {
  const identity = createHash('sha256')
    .update(`${definition.type}\0${definition.version}`)
    .digest('base64url')
    .slice(0, 16);
  return Object.freeze({
    name: `tau-job-${identity}-s${String(definition.slotCost)}-a${String(definition.maxAttempts)}`,
    slotCost: definition.slotCost,
    maxAttempts: definition.maxAttempts,
    executionTimeout: '168h',
    scheduleTimeout: '168h',
    idempotencyTtl: 604_800_000,
  });
};

/** Hatchet task and the exact Tau execution profile it accepts. @public */
export type HatchetJobTaskRegistration = {
  readonly profile: HatchetJobTaskProfile;
  readonly task: TaskWorkflowDeclaration<HatchetJobInput, HatchetJobTaskOutput>;
};

/** Typed result of dispatching one admitted Tau job through Hatchet. @public */
export type HatchetJobSubmitOutcome =
  | { readonly dispatched: true; readonly workflowRunId: string; readonly deduplicated: boolean }
  | {
      readonly dispatched: false;
      readonly reason: 'profile-mismatch' | 'unsupported-requirement';
      readonly message: string;
    };

const assertProfile = (profile: HatchetJobTaskProfile): void => {
  if (!profile.name.trim()) {
    throw new TypeError('defineHatchetJobTask: profile.name must be non-empty.');
  }
  if (!Number.isInteger(profile.slotCost) || profile.slotCost < 1) {
    throw new TypeError('defineHatchetJobTask: profile.slotCost must be a positive integer.');
  }
  if (!Number.isInteger(profile.maxAttempts) || profile.maxAttempts < 1) {
    throw new TypeError('defineHatchetJobTask: profile.maxAttempts must be a positive integer.');
  }
  if (!Number.isSafeInteger(profile.idempotencyTtl) || profile.idempotencyTtl < 1) {
    throw new TypeError('defineHatchetJobTask: profile.idempotencyTtl must be a positive safe integer.');
  }
  durationToMilliseconds(profile.executionTimeout);
  durationToMilliseconds(profile.scheduleTimeout);
};

const durationToMilliseconds = (duration: HatchetJobTaskProfile['executionTimeout']): number => {
  const amount = Number(duration.slice(0, -1));
  const unit = duration.at(-1);
  const multiplier = unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1000;
  const milliseconds = amount * multiplier;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
    throw new TypeError(`Hatchet job duration must resolve to a positive safe integer: ${JSON.stringify(duration)}.`);
  }
  return milliseconds;
};

class RetryableJobError extends Error {}

const runHeartbeats = async (input: {
  readonly identity: JobAttemptIdentity;
  readonly projection: HatchetJobProjection;
  readonly signal: AbortSignal;
  readonly onRejected: (reason: string) => void;
}): Promise<void> => {
  while (!input.signal.aborted) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- persisted execution lease is refreshed serially.
      await setTimeout(5000, undefined, { signal: input.signal });
    } catch {
      return;
    }
    let outcome: HatchetJobProjectionMutationOutcome;
    try {
      // oxlint-disable-next-line no-await-in-loop -- heartbeats must not overlap.
      outcome = await input.projection.heartbeat(input.identity);
    } catch (error) {
      input.onRejected(String(error));
      return;
    }
    if (!outcome.accepted) {
      input.onRejected(outcome.reason);
      return;
    }
  }
};

/**
 * Define one Hatchet task profile backed by a Tau provider host.
 *
 * Hatchet slot cost and retry count are registration-time values, so a job is
 * submitted only to a profile with the exact same values.
 *
 * @param options - Hatchet client, static execution profile, provider host, and durable projection sink.
 * @returns The registered task and its immutable profile.
 * @public
 */
export const defineHatchetJobTask = (options: {
  readonly client: HatchetClient;
  readonly profile: HatchetJobTaskProfile;
  /** Authenticated Tau runner identity; never derived from a client request or Hatchet UUID. */
  readonly runnerId: string;
  readonly host: JobProviderHost;
  readonly projection: HatchetJobProjection;
}): HatchetJobTaskRegistration => {
  assertProfile(options.profile);
  if (!options.runnerId.trim()) {
    throw new TypeError('defineHatchetJobTask: runnerId must be non-empty.');
  }
  const profile = Object.freeze({ ...options.profile });
  const task = options.client.task<HatchetJobInput, HatchetJobTaskOutput>({
    name: profile.name,
    retries: profile.maxAttempts - 1,
    slotCost: profile.slotCost,
    executionTimeout: profile.executionTimeout,
    scheduleTimeout: profile.scheduleTimeout,
    idempotency: {
      strategy: 'status',
      expression: 'input.idempotencyKey',
      // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- External Hatchet API field name.
      fallbackTtlMs: profile.idempotencyTtl,
    },
    async fn(input, context) {
      const identity: JobAttemptIdentity = {
        jobId: input.jobId,
        attemptId: context.taskRunExternalId(),
        attempt: context.retryCount() + 1,
        runnerId: options.runnerId,
      };
      const started = await options.projection.attemptStarted({
        ...identity,
        workflowRunId: context.workflowRunId(),
        definitionDigest: input.definitionDigest,
      });
      if (!started.accepted) {
        return { ...identity, state: 'stale' };
      }

      const heartbeatStop = new AbortController();
      const heartbeat = runHeartbeats({
        identity,
        projection: options.projection,
        signal: heartbeatStop.signal,
        onRejected: (reason) => {
          context.abortController.abort(new Error(`Job projection rejected heartbeat: ${reason}`));
        },
      });
      try {
        const outcome = await options.host.execute({
          lease: {
            ...identity,
            definition: input.definition,
            leaseExpiresAt: Date.now() + durationToMilliseconds(profile.executionTimeout),
          },
          signal: context.abortController.signal,
          onProgress: async (progress) => {
            const projected = await options.projection.progress({ ...identity, progress });
            if (!projected.accepted) {
              context.abortController.abort(new Error(`Job projection rejected progress: ${projected.reason}`));
            }
          },
        });
        if (
          outcome.status === 'failed' &&
          outcome.failure.retryable &&
          identity.attempt < input.definition.maxAttempts
        ) {
          const projected = await options.projection.retrying({ ...identity, outcome });
          if (!projected.accepted) {
            return { ...identity, state: 'stale' };
          }
          throw new RetryableJobError(outcome.failure.message);
        }

        const projected = await options.projection.finished({ ...identity, outcome });
        if (!projected.accepted) {
          return { ...identity, state: 'stale' };
        }
        return { ...identity, state: outcome.status };
      } finally {
        heartbeatStop.abort();
        await heartbeat;
      }
    },
  });
  return Object.freeze({ profile, task });
};

/**
 * Submit one job to its exact Hatchet task profile with durable idempotency and runtime affinity.
 *
 * @param input - Registered profile plus immutable Tau submission data.
 * @returns The Hatchet run identity or a typed pre-dispatch rejection.
 * @public
 */
export const submitHatchetJob = async (input: {
  readonly client: HatchetClient;
  readonly profile: HatchetJobTaskProfile;
  readonly job: HatchetJobSubmission;
  readonly runtimeAffinity: HatchetJobRuntimeAffinity;
}): Promise<HatchetJobSubmitOutcome> => {
  const { profile } = input;
  assertProfile(profile);
  if (input.job.definition.slotCost !== profile.slotCost || input.job.definition.maxAttempts !== profile.maxAttempts) {
    return {
      dispatched: false,
      reason: 'profile-mismatch',
      message: `Job requires slotCost=${String(input.job.definition.slotCost)}, maxAttempts=${String(input.job.definition.maxAttempts)}; profile provides slotCost=${String(profile.slotCost)}, maxAttempts=${String(profile.maxAttempts)}.`,
    };
  }
  const routing = toHatchetDesiredWorkerLabels(input.job.definition.requirements);
  if (!routing.matched) {
    return {
      dispatched: false,
      reason: 'unsupported-requirement',
      message: `Hatchet cannot represent ${routing.reason} for capability ${JSON.stringify(routing.key)}.`,
    };
  }
  if (!input.runtimeAffinity.value.trim()) {
    throw new TypeError('submitHatchetJob: runtimeAffinity.value must be non-empty.');
  }
  const runtimeAffinityLabel =
    input.runtimeAffinity.kind === 'owner' ? hatchetOwnerAffinityLabel : hatchetPoolAffinityLabel;

  try {
    const run = await input.client.runNoWait<HatchetJobInput, HatchetJobTaskOutput>(
      profile.name,
      structuredClone(input.job) as HatchetJobInput,
      {
        additionalMetadata: {
          tauJobId: input.job.jobId,
          definitionDigest: input.job.definitionDigest,
        },
        desiredWorkerLabels: {
          ...routing.labels,
          [runtimeAffinityLabel]: { value: input.runtimeAffinity.value, required: true },
        },
      },
    );
    return {
      dispatched: true,
      workflowRunId: await run.getWorkflowRunId(),
      deduplicated: false,
    };
  } catch (error) {
    if (error instanceof IdempotencyCollisionError) {
      return {
        dispatched: true,
        workflowRunId: error.existingRunExternalId,
        deduplicated: true,
      };
    }
    throw error;
  }
};
