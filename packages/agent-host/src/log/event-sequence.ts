// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';

const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    return `[${items.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`)
    .join(',')}}`;
};

const fingerprint = (event: AgentLogEvent): string => canonicalJson(event as unknown as JsonValue);
const cursorKey = (event: AgentLogEvent): string => `${event.leaderEpoch}\u0000${event.sequence}`;

type SequenceCheck = { readonly duplicate: true } | { readonly duplicate: false; readonly fingerprint: string };

type EventSequence = {
  check(event: AgentLogEvent): SequenceCheck;
  commit(event: AgentLogEvent, fingerprint: string): void;
};

export const createEventSequence = (): EventSequence => {
  const cursorFingerprints = new Map<string, string>();
  const closedEpochs = new Set<string>();
  let activeEpoch: string | undefined;
  let lastSequence: number | undefined;

  const check = (event: AgentLogEvent): SequenceCheck => {
    const key = cursorKey(event);
    const nextFingerprint = fingerprint(event);
    const priorFingerprint = cursorFingerprints.get(key);
    if (priorFingerprint !== undefined) {
      if (priorFingerprint !== nextFingerprint) {
        throw new EventLogError(
          'EVENT_MUTATED',
          `Leader epoch "${event.leaderEpoch}" sequence ${event.sequence} was re-used with different content.`,
        );
      }
      return { duplicate: true };
    }

    if (activeEpoch === event.leaderEpoch) {
      if (lastSequence !== undefined && event.sequence !== lastSequence + 1) {
        throw new EventLogError(
          'EVENT_OUT_OF_ORDER',
          `Leader epoch "${event.leaderEpoch}" expected sequence ${lastSequence + 1}, received ${event.sequence}.`,
        );
      }
    } else if (activeEpoch !== undefined && closedEpochs.has(event.leaderEpoch)) {
      throw new EventLogError(
        'EVENT_OUT_OF_ORDER',
        `Closed leader epoch "${event.leaderEpoch}" cannot append after epoch "${activeEpoch}".`,
      );
    }

    return { duplicate: false, fingerprint: nextFingerprint };
  };

  const commit = (event: AgentLogEvent, nextFingerprint: string): void => {
    if (activeEpoch !== event.leaderEpoch) {
      if (activeEpoch !== undefined) {
        closedEpochs.add(activeEpoch);
      }
      activeEpoch = event.leaderEpoch;
    }
    lastSequence = event.sequence;
    cursorFingerprints.set(cursorKey(event), nextFingerprint);
  };

  return { check, commit };
};
