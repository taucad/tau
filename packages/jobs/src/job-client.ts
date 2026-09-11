import type { DurableJobEvent } from '#job-event-store.js';
import type {
  JobCancellationOutcome,
  JobCoordinator,
  JobQueryOutcome,
  JobSubmission,
  JobSubmitOutcome,
} from '#job-coordinator.js';

/** Consumer-facing durable job client. @public */
export type JobClient = {
  /**
   * Submit one immutable job definition.
   *
   * @param input - Serializable provider type, inputs, requirements, options, and outputs.
   * @returns A durable acceptance or validation rejection.
   */
  submit(input: JobSubmission): Promise<JobSubmitOutcome>;
  /**
   * Read the latest job projection.
   *
   * @param input - Durable job identity.
   * @returns A discriminated found or missing projection.
   */
  get(input: { readonly jobId: string }): Promise<JobQueryOutcome>;
  /**
   * Read durable events after a reconnect cursor.
   *
   * @param input - Job identity and last observed sequence.
   * @returns Strictly later ordered events.
   */
  readEvents(input: { readonly jobId: string; readonly afterSequence: number }): Promise<readonly DurableJobEvent[]>;
  /**
   * Persist a cancellation request for queued or active work.
   *
   * @param input - Job identity and human-readable reason.
   * @returns A discriminated accepted, missing, or terminal outcome.
   */
  cancel(input: { readonly jobId: string; readonly reason: string }): Promise<JobCancellationOutcome>;
  /**
   * Subscribe to durable events at any point in the client lifecycle.
   *
   * @param event - Event channel name.
   * @param handler - Observer invoked after durable append.
   * @returns An idempotent unsubscribe function.
   */
  on(event: 'event', handler: (record: DurableJobEvent) => void): () => void;
};

/**
 * Create a lazy consumer facade over a durable coordinator adapter.
 *
 * @param options - Backend-neutral coordinator implementation.
 * @returns A consumer client with submit, query, reconnect, cancellation, and subscribe-anytime APIs.
 * @public
 *
 * @example <caption>Submit and reconnect to a job</caption>
 * ```typescript
 * import { createInMemoryJobCoordinator, createJobClient } from '@taucad/jobs';
 *
 * const coordinator = createInMemoryJobCoordinator();
 * const client = createJobClient({ coordinator });
 * ```
 */
export const createJobClient = (options: { readonly coordinator: JobCoordinator }): JobClient => ({
  submit: async (input) => options.coordinator.submit(input),
  get: async (input) => options.coordinator.get(input),
  readEvents: async (input) => options.coordinator.readEvents(input),
  cancel: async (input) => options.coordinator.requestCancellation(input),
  on: (event, handler) => options.coordinator.on(event, handler),
});
