import type {
  JobEffectiveConfiguration,
  JobInput,
  JobLifecycleState,
  JobProviderIdentity,
  JobReference,
  JobSnapshot,
} from '#jobs/job-contract.js';

/** First durable projection event emitted after successful admission. @public */
export type JobAcceptedEvent = {
  readonly type: 'job-accepted';
  readonly revision: number;
  readonly reference: JobReference;
  readonly provider: JobProviderIdentity;
  readonly input: JobInput;
  readonly configuration: JobEffectiveConfiguration;
};

/** Lifecycle transition emitted by the job authority. @public */
export type JobLifecycleEvent = {
  readonly type: 'job-lifecycle-changed';
  readonly revision: number;
  readonly reference: JobReference;
  readonly state: JobLifecycleState;
};

/** Projection events understood by the canonical reducer. @public */
export type JobProjectionEvent = JobAcceptedEvent | JobLifecycleEvent;

const transitions = new Map<JobLifecycleState, ReadonlySet<JobLifecycleState>>([
  ['queued', new Set(['running', 'waiting', 'attention_required', 'failed', 'cancelled'])],
  ['running', new Set(['waiting', 'attention_required', 'completed', 'failed', 'cancelled'])],
  ['waiting', new Set(['queued', 'running', 'attention_required', 'completed', 'failed', 'cancelled'])],
  ['attention_required', new Set(['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled'])],
  ['completed', new Set()],
  ['failed', new Set()],
  ['cancelled', new Set()],
]);

const sameReference = (left: JobReference, right: JobReference): boolean =>
  left.hostId === right.hostId && left.jobId === right.jobId;

const freezeSnapshot = (snapshot: JobSnapshot): JobSnapshot => {
  const owned = structuredClone(snapshot);
  const pending: unknown[] = [owned];
  while (pending.length > 0) {
    const value = pending.pop()!;
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === 'object' && !Object.isFrozen(child)) {
        pending.push(child);
      }
    }
    Object.freeze(value);
  }
  return owned;
};

/**
 * Reduce one ordered durable projection event into the canonical job snapshot.
 *
 * The reducer performs no I/O and rejects gaps, cross-job events, duplicate
 * admission, terminal rewrites, and unsupported lifecycle transitions.
 *
 * @param snapshot - The preceding projection, or undefined before admission.
 * @param event - The next durable job projection event.
 * @returns The next immutable projection.
 * @public
 */
export const reduceJobSnapshot = (snapshot: JobSnapshot | undefined, event: JobProjectionEvent): JobSnapshot => {
  if (snapshot === undefined) {
    if (event.type !== 'job-accepted' || event.revision !== 1) {
      throw new TypeError('The first job projection event must be job-accepted at revision 1.');
    }
    return freezeSnapshot({
      reference: event.reference,
      revision: event.revision,
      provider: event.provider,
      input: event.input,
      configuration: event.configuration,
      state: 'queued',
    });
  }

  if (event.type === 'job-accepted') {
    throw new TypeError('A job projection cannot be admitted more than once.');
  }
  if (!sameReference(snapshot.reference, event.reference)) {
    throw new TypeError('A job projection event must address the existing qualified job reference.');
  }
  if (event.revision !== snapshot.revision + 1) {
    throw new TypeError('A job projection event revision must immediately follow the current revision.');
  }
  if (!transitions.get(snapshot.state)?.has(event.state)) {
    throw new TypeError(`Unsupported job lifecycle transition from ${snapshot.state} to ${event.state}.`);
  }
  return freezeSnapshot({ ...snapshot, revision: event.revision, state: event.state });
};
