// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { parseEventLogBytes } from '#log/serialization.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';

/**
 * Reading one chat's log when more than one device has written it.
 *
 * A chat's records ride `refs/tau/chats/<chatId>` as a tree of *segments*: this
 * device appends to its own `events.jsonl`, every other device's log is
 * projected in beside it as `events/<deviceId>.jsonl`, and the paths are
 * therefore disjoint — which is what lets two devices converge by a tree union
 * with no merge driver and no line-level merge (A39, S39).
 *
 * Reading is the other half of that: one ordered view over every segment. The
 * writer is untouched (it still appends to one file) and the reducer stays the
 * single message deriver; this is the step between them.
 *
 * **The epoch does not order anything.** S39 says "the reader concatenates
 * segments in epoch order (the epoch is in every record)"; the epoch *is* in
 * every record, but it is a random UUID minted per leadership lease
 * (`createGeneration: randomUuid`), so it identifies a term and carries no
 * order at all. What every record does carry is `recordedAt`. So the order here
 * is: a leadership term's records stay contiguous and in `sequence` order —
 * a term is a run one writer owned, and splitting it would invent an interleave
 * that never happened — and the terms themselves are ordered by when they
 * started, with one device's own terms never allowed to fall out of the order
 * its own file holds them in.
 *
 * ponytail: the cross-*device* boundary is the only approximate part, and its
 * ceiling is clock skew — two unsynchronised clocks put a boundary a second or
 * two out, and a merged transcript is therefore exact on set membership and on
 * per-term order but only approximate on interleave. A causal order does exist
 * and is unused: the chat ref is a chain and each commit's tree names the
 * segments it held, so "the commit that first contained this term" is a real
 * happens-before. Read the chain here when an interleave has to be exact.
 */

/** One device's log, as the ref's tree holds it. @public */
export type ChatLogSegment = {
  /** Which device wrote it. Used only to break a tie deterministically. */
  readonly deviceId: string;
  /** The segment file's bytes. A malformed tail is dropped, as on a single log. */
  readonly bytes: Uint8Array<ArrayBuffer>;
};

type Term = {
  readonly deviceId: string;
  readonly leaderEpoch: string;
  /** Where this term sits in its own device's segment, in file order. */
  readonly order: number;
  startedAt: number;
  readonly events: AgentLogEvent[];
  /** Sequences already taken, so a twice-projected segment contributes once. */
  readonly seen: Set<number>;
};

const startedAtOf = (event: AgentLogEvent): number => {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Make one device's terms non-decreasing in the order its own file holds them.
 *
 * Within a segment the append order is authoritative and free; a backwards
 * clock step on that device (an NTP correction, a sleep/resume) would otherwise
 * reorder its history against its own file.
 *
 * @param terms - That device's terms, in the order the segment introduced them.
 */
const holdFileOrder = (terms: readonly Term[]): void => {
  let floor = Number.NEGATIVE_INFINITY;
  for (const term of terms) {
    term.startedAt = Math.max(term.startedAt, floor);
    floor = term.startedAt;
  }
};

/**
 * Every record of one chat, across every device that wrote it, in one order.
 *
 * @param segments - One entry per segment file in the chat's directory.
 * @returns The merged records: leadership terms ordered by start time, each
 *   term's own records in `sequence` order, and one device's terms never out of
 *   the order its own file holds them in. No record is dropped and none is
 *   duplicated — a record is identified by its epoch and sequence, which is the
 *   same identity the appender's own duplicate check uses.
 * @public
 *
 * @example <caption>Reading a chat two devices have written</caption>
 * ```typescript
 * import { mergeLogSegments } from '@taucad/agent-host';
 *
 * declare const read: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
 *
 * const events = mergeLogSegments([
 *   { deviceId: 'device-a', bytes: await read('.tau/chats/c1/events.jsonl') },
 *   { deviceId: 'device-b', bytes: await read('.tau/chats/c1/events/device-b.jsonl') },
 * ]);
 * ```
 */
export const mergeLogSegments = (segments: readonly ChatLogSegment[]): readonly AgentLogEvent[] => {
  const terms = new Map<string, Term>();
  for (const segment of segments) {
    const introduced: Term[] = [];
    for (const event of parseEventLogBytes(segment.bytes).events) {
      const existing = terms.get(event.leaderEpoch);
      if (existing === undefined) {
        const term: Term = {
          deviceId: segment.deviceId,
          leaderEpoch: event.leaderEpoch,
          order: introduced.length,
          startedAt: startedAtOf(event),
          events: [event],
          seen: new Set([event.sequence]),
        };
        terms.set(event.leaderEpoch, term);
        introduced.push(term);
        continue;
      }
      /* The same epoch in two segments is one term the projection copied twice,
       * not two terms: a record is its epoch and its sequence, so the second
       * copy of a sequence is dropped exactly as the appender drops it. */
      if (!existing.seen.has(event.sequence)) {
        existing.seen.add(event.sequence);
        existing.events.push(event);
      }
      /* Segments arrive in directory order, not time order, so a term's start
       * is the earliest record it holds rather than the first one read. */
      existing.startedAt = Math.min(existing.startedAt, startedAtOf(event));
    }
    holdFileOrder(introduced);
  }
  return [...terms.values()]
    .map((term) => ({ ...term, events: term.events.toSorted((left, right) => left.sequence - right.sequence) }))
    .toSorted(
      (left, right) =>
        left.startedAt - right.startedAt ||
        left.deviceId.localeCompare(right.deviceId) ||
        left.order - right.order ||
        left.leaderEpoch.localeCompare(right.leaderEpoch),
    )
    .flatMap((term) => term.events);
};
