import type {
  JobArtifactManifest,
  JobAttemptIdentity,
  JobDefinition,
  JobFailure,
  JobJsonValue,
  JobProgress,
} from '#job.types.js';

/** Durable event payloads that define the reference job state machine. @public */
export type JobEvent =
  | {
      readonly type: 'job-submitted';
      readonly idempotencyKey: string;
      readonly definitionDigest: `sha256:${string}`;
      readonly definition: JobDefinition;
    }
  | (JobAttemptIdentity & { readonly type: 'attempt-leased'; readonly leaseExpiresAt: number })
  | (JobAttemptIdentity & { readonly type: 'attempt-started' })
  | (JobAttemptIdentity & { readonly type: 'attempt-heartbeat'; readonly leaseExpiresAt: number })
  | (JobAttemptIdentity & { readonly type: 'attempt-progress'; readonly progress: JobProgress })
  | { readonly type: 'cancellation-requested'; readonly reason: string }
  | (JobAttemptIdentity & { readonly type: 'artifact-published'; readonly artifact: JobArtifactManifest })
  | (JobAttemptIdentity & { readonly type: 'attempt-completed'; readonly result: JobJsonValue })
  | (JobAttemptIdentity & { readonly type: 'attempt-failed'; readonly failure: JobFailure })
  | (JobAttemptIdentity & { readonly type: 'attempt-cancelled'; readonly reason: string })
  | (JobAttemptIdentity & { readonly type: 'attempt-lost'; readonly reason: 'lease-expired' | 'runner-lost' })
  | { readonly type: 'job-cancelled'; readonly reason: string };

/** One ordered, durably recorded job event. @public */
export type DurableJobEvent = {
  readonly jobId: string;
  readonly sequence: number;
  readonly recordedAt: number;
  readonly event: JobEvent;
};

/** Result of conditionally appending one durable job event. @public */
export type JobEventAppendOutcome =
  | { readonly appended: true; readonly record: DurableJobEvent }
  | { readonly appended: false; readonly reason: 'sequence-conflict'; readonly actualSequence: number };

/** Durable ordered-event abstraction implemented by production orchestration backends. @public */
export type JobEventStore = {
  /**
   * Append an event only if the caller holds the current sequence.
   *
   * @param input - Job identity, expected sequence, timestamp, and event payload.
   * @returns The appended record or a sequence-conflict outcome.
   */
  append(input: {
    readonly jobId: string;
    readonly expectedSequence: number;
    readonly recordedAt: number;
    readonly event: JobEvent;
  }): Promise<JobEventAppendOutcome>;
  /**
   * Read ordered events after an optional cursor.
   *
   * @param input - Job identity and last observed sequence.
   * @returns Events whose sequence is greater than the supplied cursor.
   */
  read(input: { readonly jobId: string; readonly afterSequence: number }): Promise<readonly DurableJobEvent[]>;
  /**
   * Subscribe to appended events at any point in the store lifecycle.
   *
   * @param event - Event channel name.
   * @param handler - Observer invoked after a successful append.
   * @returns An idempotent unsubscribe function.
   */
  on(event: 'event', handler: (record: DurableJobEvent) => void): () => void;
};

/**
 * Create an isolated in-memory ordered event store.
 * The implementation is a conformance reference, not a production durability boundary.
 *
 * @returns A new sequence-checked event store.
 * @public
 *
 * @example <caption>Append from the initial cursor</caption>
 * ```typescript
 * import { createMemoryJobEventStore } from '@taucad/jobs';
 *
 * const events = createMemoryJobEventStore();
 * void events.append({
 *   jobId: 'job-1',
 *   expectedSequence: 0,
 *   recordedAt: Date.now(),
 *   event: { type: 'job-cancelled', reason: 'not needed' },
 * });
 * ```
 */
export const createMemoryJobEventStore = (): JobEventStore => {
  const records = new Map<string, DurableJobEvent[]>();
  const handlers = new Set<(record: DurableJobEvent) => void>();

  return {
    async append(input) {
      const jobRecords = records.get(input.jobId) ?? [];
      const actualSequence = jobRecords.length;
      if (actualSequence !== input.expectedSequence) {
        return { appended: false, reason: 'sequence-conflict', actualSequence };
      }
      const record: DurableJobEvent = {
        jobId: input.jobId,
        sequence: actualSequence + 1,
        recordedAt: input.recordedAt,
        event: structuredClone(input.event),
      };
      jobRecords.push(record);
      records.set(input.jobId, jobRecords);
      for (const handler of handlers) {
        try {
          handler(structuredClone(record));
        } catch {
          // Observers cannot own durable append semantics.
        }
      }
      return { appended: true, record: structuredClone(record) };
    },
    async read({ jobId, afterSequence }) {
      const jobRecords = records.get(jobId) ?? [];
      return jobRecords.filter((record) => record.sequence > afterSequence).map((record) => structuredClone(record));
    },
    on(_event, handler) {
      handlers.add(handler);
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        handlers.delete(handler);
      };
    },
  };
};
