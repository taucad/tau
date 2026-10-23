import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { AgentLogEvent, RowKey, RunLifecycleState } from '#log/event-types.js';
import type { ChatLogSegment, ParsedLogSegment } from '#log/segments.js';
import { parseEventLogBytes } from '#log/serialization.js';

/**
 * Another device's run that has not settled, as that device's synced segment holds it (XD3, cross-device run fence).
 *
 * A device publishes its chat ref as a run starts and while it runs, so every other device that has synced sees the
 * run before it settles. Each segment is folded on its own through the ledger, never into this device's ledger: the
 * epochs and run bookkeeping of two devices do not order against each other (XD1).
 */

/** An unsettled run another device's segment holds. @public */
export type ForeignRun = Readonly<{
  /** The segment it was read from: the device that runs it. */
  deviceId: string;
  runId: string;
  /** Where its device's own ledger says it is; `paused` waits for that device's person. */
  state: Extract<RunLifecycleState, 'admitted' | 'running' | 'paused'>;
  /** The newest `recordedAt` among the run's rows, in epoch milliseconds, on the clock of the device that runs it. */
  lastRecordedAt: number;
  /** The key of the run's newest row. */
  tip: RowKey;
}>;

/**
 * How long a foreign run may go without a new row before it no longer holds the chat: ten minutes.
 *
 * Twice the model stream's stall bound (`streamStall`, 300 s, E9): a run whose stream stays silent that long fails
 * `MODEL_STREAM_STALLED` and settles, and a running device republishes its segment while an attempt holds its lease
 * (`@taucad/revisions` turn placement, once a minute), so a live run's newest row reaches the other devices well
 * inside it. Past it the device is gone, offline or partitioned: the run is abandoned for the fence, so a dead device
 * cannot lock a chat. Its rows stay out of the model's history until it settles (see {@link unsettledRunIds}).
 *
 * @public
 */
export const foreignRunStaleMilliseconds = 10 * 60 * 1000;

const unsettledStates: ReadonlySet<RunLifecycleState> = new Set(['admitted', 'running', 'paused']);

const timeOf = (event: AgentLogEvent): number => {
  const parsed = Date.parse(event.recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Every run one device's segment holds that has not settled, by that device's own ledger.
 *
 * @param segment - One device's rows, as its segment holds them.
 * @returns Its unsettled runs, in the order their rows first appear.
 * @internal
 */
const unsettledRunsOf = (segment: ParsedLogSegment): readonly ForeignRun[] => {
  const ledger = foldChatLedger(emptyChatLedger, segment.events);
  const runs: ForeignRun[] = [];
  for (const [runId, entry] of Object.entries(ledger.runs)) {
    if (entry.lifecycle === undefined || !unsettledStates.has(entry.lifecycle)) {
      continue;
    }
    const rows = segment.events.filter((event) => event.runId === runId);
    const tip = rows.at(-1);
    if (tip === undefined) {
      continue;
    }
    runs.push({
      deviceId: segment.deviceId,
      runId,
      state: entry.lifecycle as ForeignRun['state'],
      lastRecordedAt: Math.max(...rows.map((row) => timeOf(row))),
      tip: { leaderEpoch: tip.leaderEpoch, sequence: tip.sequence },
    });
  }
  return runs;
};

/**
 * {@link unsettledForeignRuns} over segments already parsed, for a writer that holds them.
 *
 * @param segments - Other devices' parsed segments.
 * @returns Every unsettled run, segment by segment.
 * @internal
 */
export const unsettledParsedRuns = (segments: readonly ParsedLogSegment[]): readonly ForeignRun[] =>
  segments.flatMap((segment) => unsettledRunsOf(segment));

/**
 * The unsettled runs other devices' segments hold: each segment folded on its own ledger, never merged (XD3).
 *
 * @param segments - Other devices' segments, never this device's own.
 * @returns Every unsettled run, segment by segment.
 * @public
 *
 * @example <caption>Whether another device is running a chat now</caption>
 * ```typescript
 * import { liveForeignRun, unsettledForeignRuns } from '@taucad/agent-host';
 * import type { ChatLogSegment } from '@taucad/agent-host';
 *
 * declare const segments: readonly ChatLogSegment[];
 *
 * const elsewhere = liveForeignRun(unsettledForeignRuns(segments), Date.now());
 * ```
 */
export const unsettledForeignRuns = (segments: readonly ChatLogSegment[]): readonly ForeignRun[] =>
  unsettledParsedRuns(
    segments.map((segment) => ({
      deviceId: segment.deviceId,
      events: parseEventLogBytes(segment.bytes).events,
    })),
  );

/**
 * The run ids each segment holds unsettled, by device: the rows the model's history leaves out until the run settles.
 *
 * A run in flight on another device is a user turn with no reply yet, or a tool call with no output yet; folded into
 * this device's history it would be answered here, or its call closed here as disconnected, while that device is still
 * running it. Once its device settles it and sync brings the settlement, it joins the history in full.
 *
 * @param segments - Other devices' segments.
 * @returns Each device id → its unsettled run ids.
 * @internal
 */
export const unsettledRunIds = (segments: readonly ParsedLogSegment[]): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map(segments.map((segment) => [segment.deviceId, new Set(unsettledRunsOf(segment).map((run) => run.runId))]));

/**
 * Whether a foreign run no longer holds the chat: its newest row is more than {@link foreignRunStaleMilliseconds} old,
 * or more than that far in this device's future.
 *
 * The age is read off two clocks. A device whose clock is behind looks older by its skew, so the bound is wide enough
 * that a skew of minutes still leaves a live run held. A device whose clock is ahead looks younger by its skew; one
 * more than the bound ahead names no time this device can wait out, so its run is not allowed to hold the chat: two
 * runs then fall back to each device's own history, as before the fence existed, rather than locking the chat for as
 * long as the other clock is wrong.
 *
 * @param run - The foreign run.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound; {@link foreignRunStaleMilliseconds} by default.
 * @returns `true` when the run is treated as abandoned.
 * @public
 */
export const isAbandonedForeignRun = (
  run: Pick<ForeignRun, 'lastRecordedAt'>,
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): boolean => Math.abs(now - run.lastRecordedAt) > bound;

/**
 * The foreign run that holds the chat now, if any: the newest unsettled run that is not abandoned.
 *
 * @param runs - Unsettled foreign runs.
 * @param now - This device's time, in epoch milliseconds.
 * @param bound - The staleness bound.
 * @returns The run, or `undefined` when no other device holds the chat.
 * @public
 */
export const liveForeignRun = (
  runs: readonly ForeignRun[],
  now: number,
  bound: number = foreignRunStaleMilliseconds,
): ForeignRun | undefined =>
  runs
    .filter((run) => !isAbandonedForeignRun(run, now, bound))
    .toSorted((left, right) => right.lastRecordedAt - left.lastRecordedAt)[0];
