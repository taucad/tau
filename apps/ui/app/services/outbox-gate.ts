/**
 * The durable outbox's one gate (send/queue/stop lifecycle, chat UX F1): delivery acts on it, the thread shows a send
 * as sent from it, and the queue strip draws what is left. Pure, so each rule is read in one place and tested as a
 * table; the MessageQueue model's `Ready` is the same rule.
 */
import type { ChatMessageQueueRecord, QueuedChatMessage } from '@taucad/chat-ui/db/chat-message-queue-store';
import type { ChatRunPhase as ProjectedRunPhase } from '#machines/chat-projection.logic.js';

/** The phases that keep a run live: admitted, running, or paused for the person. */
const retainsLiveRun = (phase: ProjectedRunPhase): boolean =>
  phase === 'admitted' || phase === 'running' || phase === 'paused';

/**
 * Why the outbox holds its head. The first group is this page's own readiness to deliver; the second is work ahead of
 * the head (a run, its log, a steer, a hold after a Stop), and only that makes a send *queued* (chat UX F1).
 *
 * @public
 */
export type OutboxHold =
  | 'log-not-caught-up'
  | 'not-deliverable-here'
  | 'no-host'
  | 'no-turn-host'
  | 'command-in-flight'
  | 'admitting'
  | 'chat-loading'
  | 'unrelated-live-run'
  | 'after-run-unseen'
  | 'machine-live'
  | 'withdrawing'
  | 'held'
  | 'run-not-ended';

/** This page's own readiness to deliver: none of it is work ahead of the head. @public */
export type OutboxReadiness = Readonly<{
  /** The queue actor's placement may deliver from this page. */
  deliverable: boolean;
  /** The project's host connector is attached. */
  host: boolean;
  /** The chat's turn admission is published. */
  turnHost: boolean;
  /** A command of this chat is awaiting its host answer. */
  commandInFlight: boolean;
  /** This chat's machine is admitting a turn. */
  admitting: boolean;
  /** The chat's persisted record is loading. */
  chatLoading: boolean;
}>;

/** Everything the outbox's gate reads (the MessageQueue model's `Ready`, plus this page's readiness). @public */
export type OutboxGateFacts = Readonly<{
  items: readonly QueuedChatMessage[];
  /** The log is read to its end, so its current run is known. */
  caughtUp: boolean;
  /** This page's readiness; `undefined` asks only whether work is ahead of the head. */
  readiness: OutboxReadiness | undefined;
  /** This chat's machine holds a turn or is taking one. */
  live: boolean;
  /** The log's current run, when there is one. */
  run: Readonly<{ runId: string; phase: ProjectedRunPhase }> | undefined;
  /** The run the outbox last handed over is not in the log yet ({@link isAfterRunUnseen}). */
  afterRunUnseen: boolean;
  /** The entry a Stop is taking back, which nothing may deliver. */
  withdrawing: string | undefined;
}>;

/** What the outbox does with its head now. @public */
export type OutboxGate =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'hold'; item: QueuedChatMessage; reason: OutboxHold }>
  /** A prepared command, replayed to the host it was prepared for. */
  | Readonly<{ kind: 'replay'; item: QueuedChatMessage }>
  /** A steer, sent to the live run it names. */
  | Readonly<{ kind: 'steer'; item: QueuedChatMessage }>
  /** A send, admitted as a turn of its own. */
  | Readonly<{ kind: 'deliver'; item: QueuedChatMessage }>;

/**
 * The outbox's one gate (MessageQueue `Ready`): delivery acts on it, and the thread shows the head as sent exactly
 * when only this page's readiness, never work ahead of it, stands in its way ({@link selectDepartingSend}). A prepared
 * or steering entry is the head wherever it sits.
 *
 * @param facts - The outbox, this page's readiness, the chat's machine and the log's current run.
 * @returns The head and what happens to it.
 * @public
 */
export const selectOutboxGate = (facts: OutboxGateFacts): OutboxGate => {
  const { items, readiness, run, live } = facts;
  const item = items.find((entry) => entry.command !== undefined || entry.steer !== undefined) ?? items[0];
  if (item === undefined) {
    return { kind: 'empty' };
  }
  const hold = (reason: OutboxHold): OutboxGate => ({ kind: 'hold', item, reason });
  if (!facts.caughtUp) {
    return hold('log-not-caught-up');
  }
  if (readiness !== undefined) {
    const notReady = (
      [
        [readiness.deliverable, 'not-deliverable-here'],
        [readiness.host, 'no-host'],
        [readiness.turnHost, 'no-turn-host'],
        [!readiness.commandInFlight, 'command-in-flight'],
        [!readiness.admitting, 'admitting'],
        [!readiness.chatLoading, 'chat-loading'],
      ] satisfies ReadonlyArray<readonly [boolean, OutboxHold]>
    ).find(([ready]) => !ready)?.[1];
    if (notReady !== undefined) {
      return hold(notReady);
    }
  }
  const phase = run?.phase ?? 'none';
  if (item.command !== undefined) {
    /* Prepared for its own run: its replay waits only behind an unrelated live run. */
    return run !== undefined && run.runId !== item.command.payload.runId && retainsLiveRun(phase)
      ? hold('unrelated-live-run')
      : { kind: 'replay', item };
  }
  if (facts.afterRunUnseen) {
    return hold('after-run-unseen');
  }
  if (live && !retainsLiveRun(phase)) {
    return hold('machine-live');
  }
  const { steer } = item;
  if (steer !== undefined && retainsLiveRun(phase) && run?.runId === steer.payload.runId) {
    return { kind: 'steer', item };
  }
  if (facts.withdrawing === item.id) {
    return hold('withdrawing');
  }
  if (item.held === true && steer === undefined) {
    return hold('held');
  }
  const authorizedTerminal = (phase === 'cancelled' || phase === 'failed') && item.afterTerminalRunId === run?.runId;
  if (
    run !== undefined &&
    (retainsLiveRun(phase) || (phase !== 'completed' && steer === undefined && !authorizedTerminal))
  ) {
    return hold('run-not-ended');
  }
  return { kind: 'deliver', item };
};

/**
 * Whether the run the outbox last handed over has not reached this page's log yet, so the next entry must not race
 * ahead of it. A receipt from another placement does not hold this one, unless the outbox was rebased onto it.
 *
 * @param record - The outbox as last read.
 * @param ledger - The log's ledger.
 * @param observedPlacement - The placement this page observes the chat at.
 * @returns `true` while the handed-over run is unseen.
 * @public
 */
export const isAfterRunUnseen = (
  record: Pick<ChatMessageQueueRecord, 'afterRunId' | 'afterPlacement' | 'rebasedPlacement'>,
  ledger: Readonly<{ runs: Readonly<Record<string, unknown>> }>,
  observedPlacement: string | undefined,
): boolean =>
  record.afterRunId !== undefined &&
  ledger.runs[record.afterRunId] === undefined &&
  (record.afterPlacement === undefined ||
    observedPlacement === undefined ||
    record.afterPlacement === observedPlacement) &&
  !(
    record.afterPlacement === undefined &&
    observedPlacement !== undefined &&
    record.rebasedPlacement === observedPlacement
  );

/**
 * The outbox entry that is leaving for a turn of its own, if any (send/queue/stop lifecycle, chat UX F1).
 *
 * Every send is saved to the outbox first, but only a send that waits behind work is *queued*: one made while nothing
 * runs goes straight to the thread. So the entry being delivered, or a head the gate ({@link selectOutboxGate}) would
 * hand over once this page is ready, is shown as the thread's newest request and not as a queued row. A failed
 * delivery is not leaving: it stays in the strip with its error and Retry.
 *
 * @param queue - The outbox as its actor last read it.
 * @param gate - The gate asked without this page's readiness.
 * @returns The entry, or `undefined` when every entry is queued behind work.
 * @public
 */
export const selectDepartingSend = (
  queue: Readonly<{ items: readonly QueuedChatMessage[]; sendingId: string | undefined; error: string | undefined }>,
  gate: OutboxGate,
): QueuedChatMessage | undefined => {
  if (queue.error !== undefined) {
    return undefined;
  }
  const sending = queue.sendingId === undefined ? undefined : queue.items.find((item) => item.id === queue.sendingId);
  if (sending !== undefined) {
    return sending;
  }
  return gate.kind === 'deliver' || gate.kind === 'replay' ? gate.item : undefined;
};

/**
 * The queue strip's rows: every outbox entry except the one the thread shows as sent. The entry still being delivered
 * keeps its row's order slot as `sendingId` while it is not drawn.
 *
 * @param queue - The outbox as its actor last read it.
 * @param departingId - The entry the thread shows (`ChatSessionStore.departingSendOf`).
 * @returns The rows and the id the strip treats as sending.
 * @public
 */
export const selectQueueStrip = (
  queue: Readonly<{ items: readonly QueuedChatMessage[]; sendingId?: string | undefined }>,
  departingId: string | undefined,
): Readonly<{ items: readonly QueuedChatMessage[]; sendingId: string | undefined }> => ({
  items: departingId === undefined ? queue.items : queue.items.filter((item) => item.id !== departingId),
  sendingId:
    queue.sendingId ??
    (queue.items.some((item) => item.id === departingId && item.command !== undefined) ? departingId : undefined),
});
