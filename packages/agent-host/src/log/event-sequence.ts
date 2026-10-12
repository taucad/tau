import { EventLogError } from '#log/event-log-error.js';
import { canonicalJson } from '#log/canonical-json.js';
import type { ReplayIdentity, ReplayReadRow } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';

const fingerprint = (event: AgentLogEvent): string => canonicalJson(event);
const cursorKey = (event: AgentLogEvent): string => `${event.leaderEpoch}\u0000${event.sequence}`;
/** Legacy rows carry no integer epoch and count as 0 (D5). */
const epochOf = (event: AgentLogEvent): number => event.epoch ?? 0;

type SequenceCheck = { readonly duplicate: true } | { readonly duplicate: false; readonly fingerprint: string };

/** A term rule a row in history broke; the row is still kept, because it is durable (CL-R6). @internal */
export type SequenceAnomaly = { readonly kind: 'order' | 'conflict'; readonly message: string };

type StoredIdentity = string | ReplayIdentity;
const canonicalOf = (identity: StoredIdentity): string =>
  typeof identity === 'string' ? identity : identity.canonical();

type EventSequence = {
  /** The term rules at append (CL-R5): throws `EVENT_MUTATED` or `EVENT_OUT_OF_ORDER`, never writes. */
  check(event: AgentLogEvent): SequenceCheck;
  commit(event: AgentLogEvent, fingerprint: string): void;
  /** The same rules over history (CL-R6): never throws; a broken rule is reported and the row is kept. */
  replay(event: AgentLogEvent): { readonly duplicate: boolean; readonly anomaly?: SequenceAnomaly };
  replayOwned(row: ReplayReadRow): { readonly duplicate: boolean; readonly anomaly?: SequenceAnomaly };
};

/**
 * The log's term rules: one canonical identity per `(leaderEpoch, sequence)`, each term starting at 0 and contiguous,
 * no row for a closed term, and each term's integer epoch above every earlier one (I2, I3; S6 `EpochStartsAtZero`).
 *
 * Every writer passes through these, not only the host, so no writer can start a term elsewhere than 0 or claim an
 * epoch that does not exceed the log's. A term without an integer epoch is a legacy writer's, accepted only while the
 * whole log is legacy.
 *
 * @internal
 */
export const createEventSequence = (): EventSequence => {
  const cursorFingerprints = new Map<string, StoredIdentity>();
  const termEpochs = new Map<string, number>();
  let activeTerm: string | undefined;
  let lastSequence = -1;
  let maxEpoch = 0;

  const violation = (
    event: AgentLogEvent,
    nextFingerprint: StoredIdentity,
  ): EventLogError | 'duplicate' | undefined => {
    const prior = cursorFingerprints.get(cursorKey(event));
    if (prior !== undefined) {
      return canonicalOf(prior) === canonicalOf(nextFingerprint)
        ? 'duplicate'
        : new EventLogError(
            'EVENT_MUTATED',
            `Leader epoch "${event.leaderEpoch}" sequence ${event.sequence} was re-used with different content.`,
          );
    }
    const outOfOrder = (message: string) => new EventLogError('EVENT_OUT_OF_ORDER', message);
    if (activeTerm === event.leaderEpoch) {
      if (event.sequence !== lastSequence + 1) {
        return outOfOrder(
          `Leader epoch "${event.leaderEpoch}" expected sequence ${lastSequence + 1}, received ${event.sequence}.`,
        );
      }
      return epochOf(event) === termEpochs.get(event.leaderEpoch)
        ? undefined
        : outOfOrder(`Leader epoch "${event.leaderEpoch}" must repeat its term's epoch.`);
    }
    if (termEpochs.has(event.leaderEpoch)) {
      return outOfOrder(`Closed leader epoch "${event.leaderEpoch}" cannot append after epoch "${activeTerm}".`);
    }
    if (event.sequence !== 0) {
      return outOfOrder(`Leader epoch "${event.leaderEpoch}" must start at sequence 0, received ${event.sequence}.`);
    }
    if (event.epoch === undefined ? maxEpoch > 0 : event.epoch <= maxEpoch) {
      return outOfOrder(
        `Leader epoch "${event.leaderEpoch}" must claim an epoch above ${maxEpoch}, received ${event.epoch ?? 'none'}.`,
      );
    }
    return undefined;
  };

  const commit = (event: AgentLogEvent, nextFingerprint: StoredIdentity): void => {
    if (!termEpochs.has(event.leaderEpoch)) {
      termEpochs.set(event.leaderEpoch, epochOf(event));
    }
    activeTerm = event.leaderEpoch;
    lastSequence = event.sequence;
    maxEpoch = Math.max(maxEpoch, epochOf(event));
    cursorFingerprints.set(cursorKey(event), nextFingerprint);
  };

  const replayIdentity = (
    event: AgentLogEvent,
    nextFingerprint: StoredIdentity,
  ): ReturnType<EventSequence['replay']> => {
    const found = violation(event, nextFingerprint);
    if (found === 'duplicate') {
      return { duplicate: true };
    }
    if (found?.code === 'EVENT_MUTATED') {
      // The first copy of a key stays its identity; the differing copy is reported and kept in file order.
      return { duplicate: false, anomaly: { kind: 'conflict', message: found.message } };
    }
    commit(event, nextFingerprint);
    return { duplicate: false, ...(found ? { anomaly: { kind: 'order', message: found.message } } : {}) };
  };

  return {
    check: (event) => {
      const nextFingerprint = fingerprint(event);
      const found = violation(event, nextFingerprint);
      if (found === 'duplicate') {
        return { duplicate: true };
      }
      if (found !== undefined) {
        throw found;
      }
      return { duplicate: false, fingerprint: nextFingerprint };
    },
    commit,
    replay: (event) => replayIdentity(event, fingerprint(event)),
    replayOwned: (row) => replayIdentity(row.event, row.identity),
  };
};
