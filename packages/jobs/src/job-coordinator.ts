import { matchJobCapabilities } from '#job-capability-matching.js';
import { digestJobDefinition } from '#job-definition-digest.js';
import { createMemoryJobEventStore } from '#job-event-store.js';
import type { DurableJobEvent, JobEvent, JobEventStore } from '#job-event-store.js';
import type {
  JobArtifactManifest,
  JobAttemptIdentity,
  JobAttemptLease,
  JobDefinition,
  JobFailure,
  JobJsonValue,
  JobProgress,
  JobRunnerRegistration,
  JobSnapshot,
} from '#job.types.js';

/** Idempotent submission envelope for one immutable job definition. @public */
export type JobSubmission = {
  readonly idempotencyKey: string;
  readonly definitionDigest: `sha256:${string}`;
  readonly definition: JobDefinition;
};

/** Result of submitting a job definition. @public */
export type JobSubmitOutcome =
  | { readonly accepted: true; readonly deduplicated: boolean; readonly job: JobSnapshot }
  | {
      readonly accepted: false;
      readonly reason:
        | 'invalid-definition'
        | 'invalid-idempotency-key'
        | 'definition-digest-mismatch'
        | 'idempotency-conflict';
      readonly message: string;
    };

/** Result of querying one job projection. @public */
export type JobQueryOutcome =
  | { readonly found: true; readonly job: JobSnapshot }
  | { readonly found: false; readonly reason: 'not-found' };

/** Result of requesting durable cancellation. @public */
export type JobCancellationOutcome =
  | { readonly accepted: true; readonly job: JobSnapshot }
  | { readonly accepted: false; readonly reason: 'not-found' | 'terminal'; readonly job?: JobSnapshot };

/** Result of registering or refreshing a runner advertisement. @public */
export type JobRunnerRegistrationOutcome =
  | { readonly accepted: true; readonly replaced: boolean }
  | { readonly accepted: false; readonly reason: 'invalid-registration'; readonly message: string };

/** Result of leasing the next compatible queued job. @public */
export type JobLeaseOutcome =
  | { readonly leased: true; readonly lease: JobAttemptLease }
  | {
      readonly leased: false;
      readonly reason: 'invalid-duration' | 'none-available' | 'runner-not-found' | 'runner-expired';
    };

/** Result of refreshing a registered runner heartbeat. @public */
export type JobRunnerHeartbeatOutcome =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly reason: 'invalid-heartbeat' | 'runner-not-found' | 'runner-expired';
    };

/** Result of mutating a currently leased attempt. @public */
export type JobAttemptMutationOutcome =
  | { readonly accepted: true; readonly job: JobSnapshot }
  | {
      readonly accepted: false;
      readonly reason: 'job-not-found' | 'attempt-not-active' | 'runner-mismatch' | 'lease-expired' | 'invalid-state';
      readonly job?: JobSnapshot;
    };

/** Result of an attempt heartbeat, including the durable cancellation intent. @public */
export type JobAttemptHeartbeatOutcome =
  | {
      readonly accepted: true;
      readonly cancellationRequested: boolean;
      readonly leaseExpiresAt: number;
      readonly job: JobSnapshot;
    }
  | {
      readonly accepted: false;
      readonly reason:
        | 'job-not-found'
        | 'attempt-not-active'
        | 'runner-mismatch'
        | 'lease-expired'
        | 'invalid-duration'
        | 'invalid-state';
      readonly job?: JobSnapshot;
    };

/** Result of expiring stale runner and attempt leases. @public */
export type JobLeaseExpiryOutcome = {
  readonly lostAttempts: number;
  readonly expiredRunners: readonly string[];
};

/**
 * Backend-neutral coordinator contract consumed by clients and attempt hosts.
 * Production adapters must provide transactional persistence and distributed leases.
 *
 * @public
 */
export type JobCoordinator = {
  submit(input: JobSubmission): Promise<JobSubmitOutcome>;
  get(input: { readonly jobId: string }): Promise<JobQueryOutcome>;
  readEvents(input: { readonly jobId: string; readonly afterSequence: number }): Promise<readonly DurableJobEvent[]>;
  requestCancellation(input: { readonly jobId: string; readonly reason: string }): Promise<JobCancellationOutcome>;
  registerRunner(input: {
    readonly runner: JobRunnerRegistration;
    readonly heartbeatExpiresAt: number;
  }): Promise<JobRunnerRegistrationOutcome>;
  heartbeatRunner(input: {
    readonly runnerId: string;
    readonly heartbeatExpiresAt: number;
  }): Promise<JobRunnerHeartbeatOutcome>;
  leaseNext(input: { readonly runnerId: string; readonly leaseDuration: number }): Promise<JobLeaseOutcome>;
  startAttempt(input: JobAttemptIdentity): Promise<JobAttemptMutationOutcome>;
  heartbeatAttempt(
    input: JobAttemptIdentity & {
      readonly leaseDuration: number;
    },
  ): Promise<JobAttemptHeartbeatOutcome>;
  reportProgress(input: JobAttemptIdentity & { readonly progress: JobProgress }): Promise<JobAttemptMutationOutcome>;
  completeAttempt(
    input: JobAttemptIdentity & {
      readonly artifacts: readonly JobArtifactManifest[];
      readonly result: JobJsonValue;
    },
  ): Promise<JobAttemptMutationOutcome>;
  failAttempt(input: JobAttemptIdentity & { readonly failure: JobFailure }): Promise<JobAttemptMutationOutcome>;
  cancelAttempt(input: JobAttemptIdentity & { readonly reason: string }): Promise<JobAttemptMutationOutcome>;
  expireLeases(): Promise<JobLeaseExpiryOutcome>;
  on(event: 'event', handler: (record: DurableJobEvent) => void): () => void;
};

type MutableJob = {
  jobId: string;
  idempotencyKey: string;
  definitionDigest: `sha256:${string}`;
  definition: JobDefinition;
  state: JobSnapshot['state'];
  sequence: number;
  submittedAt: number;
  attemptCount: number;
  activeAttempt?: JobSnapshot['activeAttempt'];
  artifacts: JobArtifactManifest[];
  result?: JobJsonValue;
  failure?: JobFailure;
  cancellationReason?: string;
};

type MutableRunner = {
  registration: JobRunnerRegistration;
  heartbeatExpiresAt: number;
};

const isTerminal = (state: JobSnapshot['state']): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

const isJsonValue = (value: unknown, ancestors = new Set<unknown>()): value is JobJsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, ancestors))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
};

const validateDefinition = (definition: JobDefinition): string | undefined => {
  if (!definition.type.trim() || !definition.version.trim()) {
    return 'type and version must be non-empty strings';
  }
  if (!/^sha256:[\da-f]{64}$/.test(definition.input.digest)) {
    return 'input.digest must be a lowercase SHA-256 digest';
  }
  if (!Number.isSafeInteger(definition.input.size) || definition.input.size < 0) {
    return 'input.size must be a non-negative safe integer';
  }
  if (!definition.input.mediaType.trim() || !definition.input.storageKey.trim()) {
    return 'input.mediaType and input.storageKey must be non-empty strings';
  }
  if (!Number.isInteger(definition.slotCost) || definition.slotCost < 1) {
    return 'slotCost must be a positive integer';
  }
  if (!Number.isInteger(definition.maxAttempts) || definition.maxAttempts < 1) {
    return 'maxAttempts must be a positive integer';
  }
  for (const requirement of definition.requirements) {
    if (!requirement.key.trim()) {
      return 'capability requirement keys must be non-empty strings';
    }
    if (requirement.condition === 'one-of' && requirement.values.length === 0) {
      return 'one-of capability requirements must include at least one value';
    }
    if (requirement.condition === 'at-least' && !Number.isFinite(requirement.value)) {
      return 'at-least capability requirements must use a finite number';
    }
  }
  if (!isJsonValue(definition.options)) {
    return 'options must be finite, acyclic JSON data';
  }
  return undefined;
};

const validateRunner = (runner: JobRunnerRegistration): string | undefined => {
  if (!runner.runnerId.trim()) {
    return 'runnerId must be a non-empty string';
  }
  if (!Number.isInteger(runner.slots) || runner.slots < 1) {
    return 'slots must be a positive integer';
  }
  if (
    Object.entries(runner.capabilities).some(
      ([key, value]) => !key.trim() || (typeof value === 'number' && !Number.isFinite(value)),
    )
  ) {
    return 'capabilities require non-empty keys and finite scalar values';
  }
  return undefined;
};

const cloneSnapshot = (job: MutableJob): JobSnapshot => structuredClone(job);

const attemptIdentity = (job: MutableJob): JobAttemptIdentity | undefined => {
  const active = job.activeAttempt;
  if (!active) {
    return undefined;
  }
  return {
    jobId: active.jobId,
    attemptId: active.attemptId,
    attempt: active.attempt,
    runnerId: active.runnerId,
  };
};

/**
 * Create a deterministic in-memory reference coordinator.
 * It serializes operations in one process solely to define conformance semantics; it is not a production scheduler.
 *
 * @param options - Optional clock, ID source, and durable-event implementation.
 * @returns A complete client/runner coordinator for conformance tests and local spikes.
 * @public
 *
 * @example <caption>Submit and lease a compatible job</caption>
 * ```typescript
 * import { createInMemoryJobCoordinator } from '@taucad/jobs';
 *
 * const coordinator = createInMemoryJobCoordinator();
 * ```
 */
export const createInMemoryJobCoordinator = (
  options: {
    readonly now?: () => number;
    readonly createId?: (kind: 'job' | 'attempt') => string;
    readonly eventStore?: JobEventStore;
  } = {},
): JobCoordinator => {
  const now = options.now ?? Date.now;
  let generatedId = 0;
  const createId =
    options.createId ?? ((kind: 'job' | 'attempt') => `${kind}-${String(now())}-${String(++generatedId)}`);
  const eventStore = options.eventStore ?? createMemoryJobEventStore();
  const jobs = new Map<string, MutableJob>();
  const submissions = new Map<string, { readonly jobId: string; readonly definitionDigest: `sha256:${string}` }>();
  const runners = new Map<string, MutableRunner>();
  let operationTail: Promise<void> = Promise.resolve();

  const exclusive = async <Result>(operation: () => Promise<Result> | Result): Promise<Result> => {
    const previous = operationTail;
    const gate = Promise.withResolvers<void>();
    operationTail = gate.promise;
    await previous;
    try {
      return await operation();
    } finally {
      gate.resolve();
    }
  };

  const append = async (job: MutableJob, event: JobEvent): Promise<void> => {
    const outcome = await eventStore.append({
      jobId: job.jobId,
      expectedSequence: job.sequence,
      recordedAt: now(),
      event,
    });
    if (!outcome.appended) {
      throw new Error(
        `In-memory job event sequence conflict for ${job.jobId}: expected ${String(job.sequence)}, received ${String(outcome.actualSequence)}.`,
      );
    }
    job.sequence = outcome.record.sequence;
  };

  const validateAttempt = (
    input: JobAttemptIdentity,
  ):
    | { readonly accepted: true; readonly job: MutableJob }
    | {
        readonly accepted: false;
        readonly reason: 'job-not-found' | 'attempt-not-active' | 'runner-mismatch' | 'lease-expired';
        readonly job?: JobSnapshot;
      } => {
    const job = jobs.get(input.jobId);
    if (!job) {
      return { accepted: false, reason: 'job-not-found' };
    }
    const active = job.activeAttempt;
    if (!active || active.attemptId !== input.attemptId || active.attempt !== input.attempt) {
      return { accepted: false, reason: 'attempt-not-active', job: cloneSnapshot(job) };
    }
    if (active.runnerId !== input.runnerId) {
      return { accepted: false, reason: 'runner-mismatch', job: cloneSnapshot(job) };
    }
    if (active.leaseExpiresAt <= now()) {
      return { accepted: false, reason: 'lease-expired', job: cloneSnapshot(job) };
    }
    return { accepted: true, job };
  };

  const occupiedSlots = (runnerId: string): number => {
    let occupied = 0;
    for (const job of jobs.values()) {
      if (job.activeAttempt?.runnerId === runnerId) {
        occupied += job.definition.slotCost;
      }
    }
    return occupied;
  };

  const failOrRequeue = (job: MutableJob, failure: JobFailure): void => {
    job.activeAttempt = undefined;
    if (failure.retryable && job.attemptCount < job.definition.maxAttempts && !job.cancellationReason) {
      job.state = 'queued';
      return;
    }
    job.state = job.cancellationReason ? 'cancelled' : 'failed';
    if (job.cancellationReason) {
      return;
    }
    job.failure = failure;
  };

  return {
    async submit({ definition, definitionDigest, idempotencyKey }) {
      return exclusive(async () => {
        if (!idempotencyKey.trim()) {
          return {
            accepted: false,
            reason: 'invalid-idempotency-key',
            message: 'idempotencyKey must be a non-empty string',
          };
        }
        const invalid = validateDefinition(definition);
        if (invalid) {
          return { accepted: false, reason: 'invalid-definition', message: invalid };
        }
        const actualDefinitionDigest = await digestJobDefinition(definition);
        if (definitionDigest !== actualDefinitionDigest) {
          return {
            accepted: false,
            reason: 'definition-digest-mismatch',
            message: `definitionDigest must equal ${actualDefinitionDigest}`,
          };
        }
        const previous = submissions.get(idempotencyKey);
        if (previous) {
          const existing = jobs.get(previous.jobId);
          if (previous.definitionDigest === definitionDigest && existing) {
            return { accepted: true, deduplicated: true, job: cloneSnapshot(existing) };
          }
          return {
            accepted: false,
            reason: 'idempotency-conflict',
            message: 'idempotencyKey is already bound to a different job definition',
          };
        }
        const jobId = createId('job');
        const submittedAt = now();
        const job: MutableJob = {
          jobId,
          idempotencyKey,
          definitionDigest,
          definition: structuredClone(definition),
          state: 'queued',
          sequence: 0,
          submittedAt,
          attemptCount: 0,
          artifacts: [],
        };
        await append(job, {
          type: 'job-submitted',
          idempotencyKey,
          definitionDigest,
          definition: job.definition,
        });
        jobs.set(jobId, job);
        submissions.set(idempotencyKey, { jobId, definitionDigest });
        return { accepted: true, deduplicated: false, job: cloneSnapshot(job) };
      });
    },
    async get({ jobId }) {
      return exclusive(() => {
        const job = jobs.get(jobId);
        return job ? { found: true, job: cloneSnapshot(job) } : { found: false, reason: 'not-found' };
      });
    },
    async readEvents(input) {
      return exclusive(async () => eventStore.read(input));
    },
    async requestCancellation({ jobId, reason }) {
      return exclusive(async () => {
        const job = jobs.get(jobId);
        if (!job) {
          return { accepted: false, reason: 'not-found' };
        }
        if (isTerminal(job.state)) {
          return { accepted: false, reason: 'terminal', job: cloneSnapshot(job) };
        }
        const trimmedReason = reason.trim();
        const cancellationReason = trimmedReason.length === 0 ? 'cancelled' : trimmedReason;
        await append(job, { type: 'cancellation-requested', reason: cancellationReason });
        job.cancellationReason = cancellationReason;
        if (job.activeAttempt) {
          job.state = 'cancellation-requested';
          job.activeAttempt = { ...job.activeAttempt, state: 'cancellation-requested' };
        } else {
          await append(job, { type: 'job-cancelled', reason: cancellationReason });
          job.state = 'cancelled';
        }
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async registerRunner({ runner, heartbeatExpiresAt }) {
      return exclusive(() => {
        const invalid = validateRunner(runner);
        if (invalid !== undefined || !Number.isFinite(heartbeatExpiresAt) || heartbeatExpiresAt <= now()) {
          return {
            accepted: false,
            reason: 'invalid-registration',
            message: invalid ?? 'heartbeatExpiresAt must be a future finite timestamp',
          };
        }
        const replaced = runners.has(runner.runnerId);
        runners.set(runner.runnerId, { registration: structuredClone(runner), heartbeatExpiresAt });
        return { accepted: true, replaced };
      });
    },
    async heartbeatRunner({ runnerId, heartbeatExpiresAt }) {
      return exclusive(() => {
        const runner = runners.get(runnerId);
        if (!runner) {
          return { accepted: false, reason: 'runner-not-found' };
        }
        const currentTime = now();
        if (runner.heartbeatExpiresAt <= currentTime) {
          return { accepted: false, reason: 'runner-expired' };
        }
        if (!Number.isFinite(heartbeatExpiresAt) || heartbeatExpiresAt <= currentTime) {
          return { accepted: false, reason: 'invalid-heartbeat' };
        }
        runner.heartbeatExpiresAt = heartbeatExpiresAt;
        return { accepted: true };
      });
    },
    async leaseNext({ runnerId, leaseDuration }) {
      return exclusive(async () => {
        const runner = runners.get(runnerId);
        if (!runner) {
          return { leased: false, reason: 'runner-not-found' };
        }
        const currentTime = now();
        if (runner.heartbeatExpiresAt <= currentTime) {
          return { leased: false, reason: 'runner-expired' };
        }
        if (!Number.isFinite(leaseDuration) || leaseDuration <= 0) {
          return { leased: false, reason: 'invalid-duration' };
        }
        const occupied = occupiedSlots(runnerId);
        let selected: MutableJob | undefined;
        for (const job of jobs.values()) {
          if (job.state !== 'queued') {
            continue;
          }
          const match = matchJobCapabilities({
            requirements: job.definition.requirements,
            slotCost: job.definition.slotCost,
            occupiedSlots: occupied,
            runner: runner.registration,
          });
          if (!match.matched) {
            continue;
          }
          selected = job;
          break;
        }
        if (!selected) {
          return { leased: false, reason: 'none-available' };
        }
        selected.attemptCount += 1;
        const identity: JobAttemptIdentity = {
          jobId: selected.jobId,
          attemptId: createId('attempt'),
          attempt: selected.attemptCount,
          runnerId,
        };
        const leaseExpiresAt = currentTime + leaseDuration;
        await append(selected, { type: 'attempt-leased', ...identity, leaseExpiresAt });
        selected.state = 'leased';
        selected.activeAttempt = {
          ...identity,
          state: 'leased',
          leaseExpiresAt,
          lastHeartbeatAt: currentTime,
        };
        return {
          leased: true,
          lease: { ...identity, definition: structuredClone(selected.definition), leaseExpiresAt },
        };
      });
    },
    async startAttempt(input) {
      return exclusive(async () => {
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (job.state !== 'leased' || !job.activeAttempt) {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        await append(job, { type: 'attempt-started', ...input });
        job.state = 'running';
        job.activeAttempt = { ...job.activeAttempt, state: 'running' };
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async heartbeatAttempt(input) {
      return exclusive(async () => {
        if (!Number.isFinite(input.leaseDuration) || input.leaseDuration <= 0) {
          return { accepted: false, reason: 'invalid-duration' };
        }
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (isTerminal(job.state) || !job.activeAttempt) {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        const currentTime = now();
        const leaseExpiresAt = currentTime + input.leaseDuration;
        await append(job, { type: 'attempt-heartbeat', ...input, leaseExpiresAt });
        job.activeAttempt = { ...job.activeAttempt, leaseExpiresAt, lastHeartbeatAt: currentTime };
        return {
          accepted: true,
          cancellationRequested: job.state === 'cancellation-requested',
          leaseExpiresAt,
          job: cloneSnapshot(job),
        };
      });
    },
    async reportProgress(input) {
      return exclusive(async () => {
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (job.state !== 'running' && job.state !== 'cancellation-requested') {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        await append(job, { type: 'attempt-progress', ...input });
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async completeAttempt(input) {
      return exclusive(async () => {
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (job.state !== 'running') {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        for (const artifact of input.artifacts) {
          // Artifact announcements are ordered before the terminal event by contract.
          // oxlint-disable-next-line eslint/no-await-in-loop -- Artifact event order must match the declared manifest order.
          await append(job, { type: 'artifact-published', ...input, artifact });
          job.artifacts.push(structuredClone(artifact));
        }
        await append(job, { type: 'attempt-completed', ...input, result: input.result });
        job.state = 'completed';
        job.result = structuredClone(input.result);
        job.activeAttempt = undefined;
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async failAttempt(input) {
      return exclusive(async () => {
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (job.state !== 'running' && job.state !== 'cancellation-requested') {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        await append(job, { type: 'attempt-failed', ...input });
        failOrRequeue(job, input.failure);
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async cancelAttempt(input) {
      return exclusive(async () => {
        const validated = validateAttempt(input);
        if (!validated.accepted) {
          return validated;
        }
        const { job } = validated;
        if (job.state !== 'running' && job.state !== 'leased' && job.state !== 'cancellation-requested') {
          return { accepted: false, reason: 'invalid-state', job: cloneSnapshot(job) };
        }
        await append(job, { type: 'attempt-cancelled', ...input });
        job.state = 'cancelled';
        job.cancellationReason = input.reason;
        job.activeAttempt = undefined;
        return { accepted: true, job: cloneSnapshot(job) };
      });
    },
    async expireLeases() {
      return exclusive(async () => {
        const currentTime = now();
        const expiredRunners: string[] = [];
        for (const [runnerId, runner] of runners) {
          if (runner.heartbeatExpiresAt <= currentTime) {
            expiredRunners.push(runnerId);
            runners.delete(runnerId);
          }
        }
        let lostAttempts = 0;
        for (const job of jobs.values()) {
          const active = job.activeAttempt;
          if (!active) {
            continue;
          }
          const runnerLost = expiredRunners.includes(active.runnerId);
          if (!runnerLost && active.leaseExpiresAt > currentTime) {
            continue;
          }
          const identity = attemptIdentity(job);
          if (!identity) {
            continue;
          }
          // Loss events are appended serially so observer order matches deterministic job iteration.
          // oxlint-disable-next-line eslint/no-await-in-loop -- Loss events must preserve deterministic job iteration order.
          await append(job, {
            type: 'attempt-lost',
            ...identity,
            reason: runnerLost ? 'runner-lost' : 'lease-expired',
          });
          lostAttempts += 1;
          failOrRequeue(job, {
            code: 'ATTEMPT_LOST',
            message: runnerLost ? 'The assigned runner heartbeat expired.' : 'The attempt lease expired.',
            retryable: true,
          });
        }
        return { lostAttempts, expiredRunners };
      });
    },
    on(event, handler) {
      return eventStore.on(event, handler);
    },
  };
};
