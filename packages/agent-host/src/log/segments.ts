import { canonicalJson } from '#log/canonical-json.js';
import { parseEventLogBytes } from '#log/serialization.js';
import type { AgentLogEvent, RowKey } from '#log/event-types.js';

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
 * **The epoch does not order anything across devices.** S39 says "the reader
 * concatenates segments in epoch order"; `leaderEpoch` is a random id minted
 * per leadership lease, and the integer `epoch` (D5) is monotone only within
 * one device's log, so neither orders two devices' terms. What every record does carry is `recordedAt`. So the order here
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
 *
 * A second approximation lives outside this merge: while this device's run is
 * still streaming, a fetched foreign turn that started later is placed after
 * the run's user message, and the live assistant is appended after it. The
 * order is right again once the run settles and the transcript is re-derived
 * from the merged log.
 */

/** One device's log, as the ref's tree holds it. @public */
export type ChatLogSegment = {
  /** Which device wrote it. Used only to break a tie deterministically. */
  readonly deviceId: string;
  /** The segment file's bytes. A malformed tail is dropped, as on a single log. */
  readonly bytes: Uint8Array<ArrayBuffer>;
};

/** @public */
export type MergeLogSegmentsOptions = Readonly<{
  /** Two segments hold different rows under one key; the copy from the term's device is kept. */
  onConflict?: (conflict: Readonly<{ key: RowKey; keptDeviceId: string; droppedDeviceId: string }>) => void;
}>;

type Copy = { readonly event: AgentLogEvent; readonly deviceId: string; readonly canonical: string };

type Term = {
  readonly leaderEpoch: string;
  /** Each device id → where the term first appears among that device's segments, in file order. */
  readonly orderByDevice: Map<string, number>;
  /** Each sequence → every copy read, from every segment. */
  readonly copies: Map<number, Copy[]>;
  startedAt: number;
};

const startedAtOf = (event: AgentLogEvent): number => {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Code-unit order, not `localeCompare`: the merge must agree on every machine.
const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** The term's device: the smallest deviceId among the segments holding it (CL-R14). */
const deviceOf = (term: Term): string => [...term.orderByDevice.keys()].toSorted(compare)[0]!;

/**
 * Every record of one chat, across every device that wrote it, in one order (I6, CL-R14).
 *
 * The result is the exact union of the segments' rows by key, `(leaderEpoch, sequence)`, and it depends only on the
 * set of rows: neither segment order nor a segment read twice changes it. A term's start is the earliest record any
 * copy holds; each device's terms are then clamped once, in the order its own file holds them, so a backwards clock
 * step on one device never reorders its own history; terms are ordered by that clamped start, then device, then file
 * order; and each term's records stay contiguous in `sequence` order. Two different rows under one key keep the copy
 * from the term's device (the smallest canonical form among its copies), and the other is reported through
 * `onConflict`.
 *
 * @param segments - One entry per segment file in the chat's directory.
 * @param options - `onConflict` hears about each conflicting copy dropped.
 * @returns The merged records.
 * @public
 *
 * @example <caption>Reading a chat two devices have written</caption>
 * ```typescript
 * import { mergeLogSegments } from '@taucad/agent-host';
 *
 * declare const read: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
 *
 * const events = mergeLogSegments(
 *   [
 *     { deviceId: 'device-a', bytes: await read('.tau/chats/c1/events.jsonl') },
 *     { deviceId: 'device-b', bytes: await read('.tau/chats/c1/events/device-b.jsonl') },
 *   ],
 *   { onConflict: ({ key }) => console.warn('conflicting copies of', key) },
 * );
 * ```
 */
export const mergeLogSegments = (
  segments: readonly ChatLogSegment[],
  options: MergeLogSegmentsOptions = {},
): readonly AgentLogEvent[] => {
  const terms = new Map<string, Term>();
  for (const segment of segments) {
    const introduced = new Set<string>();
    for (const event of parseEventLogBytes(segment.bytes).events) {
      let term = terms.get(event.leaderEpoch);
      if (term === undefined) {
        term = {
          leaderEpoch: event.leaderEpoch,
          orderByDevice: new Map(),
          copies: new Map(),
          startedAt: startedAtOf(event),
        };
        terms.set(event.leaderEpoch, term);
      }
      if (!introduced.has(event.leaderEpoch)) {
        introduced.add(event.leaderEpoch);
        const order = introduced.size - 1;
        term.orderByDevice.set(segment.deviceId, Math.min(order, term.orderByDevice.get(segment.deviceId) ?? order));
      }
      term.startedAt = Math.min(term.startedAt, startedAtOf(event));
      const copies = term.copies.get(event.sequence) ?? [];
      copies.push({ event, deviceId: segment.deviceId, canonical: canonicalJson(event) });
      term.copies.set(event.sequence, copies);
    }
  }

  const placed = [...terms.values()].map((term) => {
    const deviceId = deviceOf(term);
    return { term, deviceId, order: term.orderByDevice.get(deviceId)! };
  });
  // One clamp per device, in its own file order: a term never starts before an earlier term of its device.
  const clamped = new Map<Term, number>();
  const byDevice = Map.groupBy(placed, (entry) => entry.deviceId);
  for (const entries of byDevice.values()) {
    let floor = Number.NEGATIVE_INFINITY;
    for (const { term } of entries.toSorted(
      (left, right) => left.order - right.order || compare(left.term.leaderEpoch, right.term.leaderEpoch),
    )) {
      floor = Math.max(floor, term.startedAt);
      clamped.set(term, floor);
    }
  }

  return placed
    .toSorted(
      (left, right) =>
        clamped.get(left.term)! - clamped.get(right.term)! ||
        compare(left.deviceId, right.deviceId) ||
        left.order - right.order ||
        compare(left.term.leaderEpoch, right.term.leaderEpoch),
    )
    .flatMap(({ term, deviceId }) =>
      [...term.copies.entries()]
        .toSorted(([left], [right]) => left - right)
        .map(([sequence, copies]) => {
          const own = copies.filter((copy) => copy.deviceId === deviceId);
          // The device id breaks a tie between equal copies, so `keptDeviceId` does not depend on segment order.
          const kept = (own.length > 0 ? own : copies).toSorted(
            (left, right) => compare(left.canonical, right.canonical) || compare(left.deviceId, right.deviceId),
          )[0]!;
          const dropped = new Map<string, string>();
          for (const copy of copies.toSorted((left, right) => compare(left.deviceId, right.deviceId))) {
            if (copy.canonical !== kept.canonical && !dropped.has(copy.canonical)) {
              dropped.set(copy.canonical, copy.deviceId);
            }
          }
          for (const droppedDeviceId of dropped.values()) {
            options.onConflict?.({
              key: { leaderEpoch: term.leaderEpoch, sequence },
              keptDeviceId: kept.deviceId,
              droppedDeviceId,
            });
          }
          return kept.event;
        }),
    );
};
