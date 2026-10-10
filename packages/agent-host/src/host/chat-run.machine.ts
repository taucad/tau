/**
 * `chatRun` (M1, W7): one actor per chat incarnation, and the single decider of its `run.lifecycle` rows (RA-R1).
 *
 * It serves the chat's commands (`start`, `resume`, `cancel`, `steer`, `interrupt`, `resolve-interrupt`), holds the
 * run slot while an attempt reserves, runs and ends, and answers each command only once its rows are durable (I18).
 * Effects are custom actions a composition root provides (`createChatRunActor`); drivers and effects report back as
 * correlated public events, checked before anything else (MC-R18). It invokes and spawns nothing (D18).
 *
 * Durable sources (MC-R5): `context.ledger` is W3's fold of the chat log, set only from `logOpened` and
 * `rowsCommitted`, and refolded by `openLog` on every incarnation. The slot, held commands and pending answers are
 * memory-only (D3): a restart finds an open run with no slot, and opening abandons it (`orphaned`).
 *
 * Every transition carries the `ChatRunSlot.tla` action it refines as static `meta.tla` (MC-R27, via `refines`).
 * A branch that refuses or drops a stale answer (a stutter) stays under its transition's label. `Unmodelled` marks a
 * transition the spec does not model (the fault root, eviction, the settle back-off); where one event holds a modelled
 * and an unmodelled branch, `branches` splits them into two labelled transitions (W7.r1): the stop bound's external,
 * no-placement, interrupt and close branches; gate refusals that return to rest; `complete`'s refused and unknown
 * answers; failed `abandon` and `acknowledge` calls. The no-placement stop bound writes its ending row with no fence:
 * W8 closes D13 for the no-placement stop bound.
 */

import { setup, types } from 'xstate';

import { chatRunState, executionRefusal, reopens } from '#log/chat-ledger.js';
import type { ChatLedger, LogRowBody, RunEntry } from '#log/chat-ledger.js';
import type { JsonValue, RunFailureDetail, TurnPlacement } from '#log/event-types.js';
import { isResumableRun } from '#log/resumable.js';
import { chatRunCommandSchemas } from '#host/chat-run-events.js';
import type {
  ApprovalRequest,
  ApprovalResolution,
  ChatRunEffectArgs,
  ChatRunHostEvent,
  ChatRunKind,
  ChatRunOutcomeEvent,
  ChatRunRow,
  DriverOutcome,
  HeldCommand,
} from '#host/chat-run-events.js';
import type { TurnAttemptKey, TurnSettlementRow } from '#waist/ports.js';
import type { CommandAnswer } from '#wire/commands.schema.js';
import { refusalOf } from '#wire/refusals.js';
import type { RefusalCode } from '#wire/refusals.js';

/** One incarnation's identity: its chat, the term its rows are stamped under, and whether placement is wired. */
export type ChatRunInput = Readonly<{
  chatId: string;
  /** The term id every row of this incarnation carries; W3's `stampRows` gives it the next epoch (RA-R5). */
  leaderEpoch: string;
  /** A placement port is wired (W8): attempts are placed, settled and acknowledged (RA-R12). */
  placement: boolean;
}>;

/** Why an incarnation stopped serving; the registry reports it (W6). */
export type ChatRunCause = 'close' | 'relinquish' | 'fenced' | 'fault' | 'evicted' | 'openFailed';

/** The spec actions M1's transitions refine (`ChatRunSlot.tla`). */
export type ChatRunSlotAction =
  | 'logOpened'
  | 'markAbandoned'
  | 'start'
  | 'resume'
  | 'admissionPrepared'
  | 'resumePrepared'
  | 'placed'
  | 'steer'
  | 'cancel'
  | 'interrupt'
  | 'resolveInterrupt'
  | 'approvalRequested'
  | 'agentEnded'
  | 'abandon'
  | 'rowsCommitted'
  | 'complete'
  | 'settlementPublished'
  | 'acknowledge'
  | 'admissionRefused'
  | 'resumeRefused'
  | 'send'
  | 'close'
  | 'relinquish'
  | 'logFenced'
  | 'logClosed'
  | 'placementRefused'
  | 'abandoned';

/** A transition's label: the spec action its success path refines, or `Unmodelled`. */
export type ChatRunTransitionLabel = ChatRunSlotAction | 'Unmodelled';

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes (k9); drop the cast when xstate
 * types it.
 *
 * @param tla - The `ChatRunSlot.tla` action the transition's success path refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: ChatRunTransitionLabel, to: F): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/**
 * One event's modelled and unmodelled branches as two transitions, each labelled: `unmodelled` returns `undefined`
 * (disabled) wherever `modelled` applies, and xstate takes the first enabled transition. Setup types admit no
 * transition arrays, hence the one cast; `unmodelled` takes its parameter types from `modelled`, which the setup types.
 *
 * @param unmodelled - The `Unmodelled` branch, disabled where the modelled one applies.
 * @param modelled - The branch the spec action refines (it declares `enq` when `unmodelled` uses it).
 * @returns Both transitions.
 */
const branches = <F>(
  unmodelled: F extends (...args: infer Args) => unknown ? (...args: Args) => unknown : never,
  modelled: F,
): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  [unmodelled, modelled] as unknown as F;

type Ending = Readonly<{
  reason: 'ended' | 'cancel' | 'interrupt' | 'close' | 'refused';
  /** The cancel or interrupt the ending rows answer. */
  commandId?: string;
  interrupt?: Readonly<{ interruptId: string; kind: string; prompt: string; payload?: JsonValue }>;
  outcome?: DriverOutcome;
  failure?: RunFailureDetail;
  stopReason?: string;
  /** A placement refusal's settlement row, written with the ending (TS-R1). */
  settlement?: LogRowBody;
}>;

/** The run slot: required in `reserving`, `running` and `ending` (MC-R26). Memory-only (D3). */
type Slot = Readonly<{
  commandId: string;
  verb: 'start' | 'resume';
  kind: ChatRunKind;
  /** Attempt `0` until the intent rows are durable and the ledger names it. */
  key: TurnAttemptKey;
  mode: 'start' | 'continue' | 'complete';
  checkoutId?: string;
  /** Attempt 1's start rows before `running`. */
  start: readonly LogRowBody[];
  placement?: TurnPlacement;
  /** The driver was started: the ending row's `executed`, and the settlement's `cut` (TS-R11). */
  started: boolean;
  ending?: Ending;
  held: readonly HeldCommand[];
  /** Steers forwarded to the driver whose rows are not yet durable (RA-R10). */
  steers: readonly string[];
  /** An external request's resolution waiting for its rows. */
  decision?: Readonly<{ commandId: string; resolution: ApprovalResolution }>;
}>;

/** One attempt owed settlement (W8). */
type Settle = Readonly<{ key: TurnAttemptKey; cut: boolean; answered: boolean; row?: TurnSettlementRow }>;

/** A decision batch written outside a slot: a paused run's resolution or cancel. */
type Write = Readonly<{ commandId: string }>;

type ChatRunContext = Readonly<{
  chatId: string;
  leaderEpoch: string;
  placement: boolean;
  ledger: ChatLedger;
  /** The chat's lease records opening left held (TS-Q5): each settles as its run's current attempt. */
  held: readonly TurnAttemptKey[];
  /** Mints effect keys: `${label}:${seq}`. */
  seq: number;
  /** The key of M1's own append in flight, if any. */
  pending: string | undefined;
  /** This incarnation's opening abandoned an orphan (the attach answer's `takeover`). */
  takeover: boolean;
  cause: ChatRunCause | undefined;
  /** Why the log could not be opened, for the commands the registry was holding. */
  failure: Readonly<{ code: string; message: string }> | undefined;
}>;

type SlotContext = ChatRunContext & Readonly<{ slot: Slot }>;
type SettleContext = ChatRunContext & Readonly<{ settle: Settle }>;
type WriteContext = ChatRunContext & Readonly<{ write: Write }>;

const withSlot = types<SlotContext>();
const withSettle = types<SettleContext>();

/** The append key of the attempt's `turn.*` row. */
const isSettleKey = (context: SettleContext, key: string | undefined): boolean =>
  key === `settle:${context.settle.key.runId}:${String(context.settle.key.attempt)}`;
const withWrite = types<WriteContext>();

/**
 * Events a state ignores (MC-R17): every answer of that type there is stale. Outcomes in the other states are
 * answered `{}` after their correlation check.
 */
export const chatRunIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────

const minted = (context: ChatRunContext, label: string): Readonly<{ key: string; seq: number }> => ({
  key: `${label}:${String(context.seq)}`,
  seq: context.seq + 1,
});

const isRecord = (value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

const durable = (ledger: ChatLedger, commandId: string, status: 'applied' | 'replayed' = 'applied'): CommandAnswer => ({
  commandId,
  generation: ledger.maxEpoch,
  status,
  effect: 'durable',
  cursor: ledger.applied[commandId]?.cursor ?? ledger.position.cursor,
});

const refused = (
  ledger: ChatLedger,
  commandId: string,
  refusal: Readonly<{ code: string; message: string; details?: JsonValue; effect?: 'not-applied' | 'unknown' }>,
): CommandAnswer => ({
  commandId,
  generation: ledger.maxEpoch,
  status: 'refused',
  effect: refusal.effect ?? 'not-applied',
  code: refusal.code,
  message: refusal.message,
  ...(isRecord(refusal.details) ? { details: refusal.details } : {}),
});

/** W4's `A0`: applied with nothing to do; `details.state` names the run's state. */
const nothingToDo = (
  ledger: ChatLedger,
  commandId: string,
  details: Readonly<Record<string, JsonValue>>,
): CommandAnswer => ({
  commandId,
  generation: ledger.maxEpoch,
  status: 'applied',
  effect: 'not-applied',
  details: { ...details },
});

const currentEntry = (ledger: ChatLedger): RunEntry | undefined =>
  ledger.currentRunId === undefined ? undefined : ledger.runs[ledger.currentRunId];

const runState = (ledger: ChatLedger): string => {
  const entry = currentEntry(ledger);
  return entry?.lifecycle ?? 'none';
};

/** The later of two ledgers: a driver's commit can race M1's, and the fold only moves forward. */
const newer = (current: ChatLedger, next: ChatLedger): ChatLedger =>
  next.position.cursor >= current.position.cursor ? next : current;

const liveRefusal = (context: ChatRunContext, commandId: string, state?: string): CommandAnswer => {
  if (context.cause === 'relinquish' || context.cause === 'fenced' || context.cause === 'fault') {
    return refused(context.ledger, commandId, {
      code: 'LEADERSHIP_LOST' satisfies RefusalCode,
      message: `This host no longer leads chat ${context.chatId}; send the command again.`,
      ...(context.cause === 'fault' ? { effect: 'unknown' } : {}),
    });
  }
  if (context.cause !== undefined) {
    return refused(context.ledger, commandId, {
      code: 'HOST_CLOSED' satisfies RefusalCode,
      message: 'The Tau agent host is closed.',
    });
  }
  const current = state ?? chatRunState(context.ledger);
  return refused(context.ledger, commandId, {
    code: 'CHAT_RUN_LIVE' satisfies RefusalCode,
    message: `Chat ${context.chatId} has a ${current} run; send the command again after it ends.`,
    details: {
      state: current,
      ...(context.ledger.currentRunId === undefined ? {} : { runId: context.ledger.currentRunId }),
    },
  });
};

const notLive = (context: ChatRunContext, commandId: string, runId: string): CommandAnswer =>
  context.cause === undefined
    ? refused(context.ledger, commandId, {
        code: 'RUN_NOT_LIVE' satisfies RefusalCode,
        message: `Run ${runId} is not live.`,
        details: { state: runState(context.ledger) },
      })
    : liveRefusal(context, commandId);

const notPending = (
  context: ChatRunContext,
  commandId: string,
  { interruptId, runId }: Readonly<{ interruptId: string; runId: string }>,
): CommandAnswer =>
  context.cause === undefined
    ? refused(context.ledger, commandId, {
        code: 'INTERRUPT_NOT_PENDING' satisfies RefusalCode,
        message: `Interrupt ${interruptId} is not pending on run ${runId}: it was already resolved, cancelled with its run, or never issued.`,
      })
    : liveRefusal(context, commandId);

/** No ending row carries a `wait` code (RA-R1): such a failure is recorded `RUN_ABANDONED`, keeping the code. */
const endingFailure = (failure: RunFailureDetail | undefined): RunFailureDetail => {
  const detail = failure ?? { message: 'The run ended without a result.' };
  if (detail.code !== undefined && refusalOf(detail.code).retry === 'wait') {
    return {
      code: 'RUN_ABANDONED' satisfies RefusalCode,
      message: detail.message,
      details: { ...detail.details, code: detail.code },
    };
  }
  return detail;
};

const lifecycle = (state: string, fields: Readonly<Record<string, unknown>> = {}): LogRowBody =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- run.lifecycle is a loose row; M1's fields (`executed`, `admission`, `selection`) ride it (RA-Q4).
  ({ type: 'run.lifecycle', state, ...fields }) as LogRowBody;

const resolvedRow = (resolution: ApprovalResolution, extra: Readonly<Record<string, JsonValue>> = {}): LogRowBody => ({
  type: 'interrupt.recorded',
  interruptId: resolution.interruptId,
  phase: 'resolved',
  reason: resolution.outcome,
  payload: {
    outcome: resolution.outcome,
    ...(resolution.optionId === undefined ? {} : { optionId: resolution.optionId }),
    ...(resolution.payload === undefined ? {} : { response: resolution.payload }),
    ...extra,
  },
});

/** Every request an external run still holds, resolved `cancelled`: nothing will ever answer it once the run ends. */
const cancelPending = (ledger: ChatLedger, runId: string, code?: string): LogRowBody[] =>
  Object.keys(ledger.runs[runId]?.pendingInterrupts ?? {}).map((interruptId) =>
    resolvedRow({ interruptId, outcome: 'cancelled' }, code === undefined ? {} : { code }),
  );

/** The ending batch M1 writes for one attempt (RA-S4): one decider, no transient terminal row (D8). */
const endingRows = (context: SlotContext): readonly ChatRunRow[] => {
  const { slot, ledger } = context;
  const ending = slot.ending ?? { reason: 'ended' };
  const { runId } = slot.key;
  const executed = slot.started;
  const withCommand = (body: LogRowBody): ChatRunRow =>
    ending.commandId === undefined ? { runId, body } : { runId, body, commandId: ending.commandId };
  const plain = (body: LogRowBody): ChatRunRow => ({ runId, body });
  /* A resolution already on its way to the log is not cancelled as well: one request, one `resolved` row. */
  const deciding = slot.decision?.resolution.interruptId;
  const external =
    slot.kind === 'external'
      ? cancelPending(ledger, runId).filter((row) => row.type !== 'interrupt.recorded' || row.interruptId !== deciding)
      : [];
  if (ending.reason === 'cancel' && ending.outcome !== 'completed') {
    const entry = ledger.runs[runId];
    const retained = entry?.committed === true && (entry.kind === 'tau' || entry.externalPrompted === true);
    return [
      ...external,
      lifecycle('cancelled', {
        executed,
        ...(retained
          ? { detail: { code: 'USER_STOPPED', message: 'You stopped this turn. Resume to continue it.' } }
          : {}),
      }),
    ].map((body) => withCommand(body));
  }
  if (ending.reason === 'interrupt' && ending.outcome === 'aborted' && ending.interrupt !== undefined) {
    const { interrupt } = ending;
    return [
      {
        type: 'interrupt.recorded',
        interruptId: interrupt.interruptId,
        phase: 'requested',
        reason: interrupt.prompt,
        payload: {
          kind: interrupt.kind,
          prompt: interrupt.prompt,
          ...(interrupt.payload === undefined ? {} : { context: interrupt.payload }),
        },
      } satisfies LogRowBody,
      lifecycle('paused', { executed }),
    ].map((body) => withCommand(body));
  }
  if (ending.reason === 'refused') {
    return [
      plain(lifecycle('failed', { detail: endingFailure(ending.failure), executed: false })),
      ...(ending.settlement === undefined ? [] : [plain(ending.settlement)]),
    ];
  }
  if (ending.outcome === 'completed') {
    return [
      ...external.map((body) => plain(body)),
      plain(
        lifecycle('completed', {
          executed,
          ...(ending.stopReason === undefined ? {} : { stopReason: ending.stopReason }),
        }),
      ),
    ];
  }
  if (ending.reason === 'close' || ending.outcome === 'aborted') {
    const detail =
      ending.reason === 'close'
        ? {
            code: 'RUN_ABANDONED',
            message: 'The host closed while this run was live. Resume the turn to continue it.',
            details: { cause: 'close' },
          }
        : { code: 'RUN_ABANDONED', message: 'The run stopped before it finished. Resume the turn to continue it.' };
    return [...external.map((body) => plain(body)), plain(lifecycle('failed', { detail, executed }))];
  }
  return [
    ...external.map((body) => plain(body)),
    plain(
      lifecycle('failed', {
        detail: endingFailure(ending.failure),
        executed,
        ...(ending.stopReason === undefined ? {} : { stopReason: ending.stopReason }),
      }),
    ),
  ];
};

/** An open run with no slot in this incarnation: its driver died with the last one (D10). */
const orphanRows = (ledger: ChatLedger): readonly ChatRunRow[] => {
  const runId = ledger.currentRunId;
  const entry = currentEntry(ledger);
  if (runId === undefined || entry === undefined) {
    return [];
  }
  /* An agent that waited on a person when its host died: the request is resolved, never left open (L4 D-112),
   * whether or not the run had reached its `paused` row. The agent's process died with the host, but its session
   * survives, so the run is abandoned resumably: Resume reattaches the session and the agent asks again. */
  if (entry.kind === 'external' && (entry.lifecycle === 'paused' || Object.keys(entry.pendingInterrupts).length > 0)) {
    const code = 'RUN_ABANDONED' satisfies RefusalCode;
    return [
      ...cancelPending(ledger, runId, code),
      lifecycle('failed', {
        detail: {
          code,
          message: 'Tau closed while the agent waited for your approval. Resume the turn and the agent asks again.',
          details: { cause: 'awaiting-approval' },
        },
        executed: true,
      }),
    ].map((body) => ({ runId, body }));
  }
  const executed = entry.lifecycle === 'running' || entry.attempt > 1;
  return [
    {
      runId,
      body: lifecycle('failed', {
        detail: {
          code: 'RUN_ABANDONED' satisfies RefusalCode,
          message: 'The host executing this run is gone. Resume the turn to continue it.',
        },
        executed,
      }),
    },
  ];
};

/**
 * An open run no driver holds: what a new incarnation abandons at opening (D10). The launcher asks for a claim on it.
 *
 * @param ledger - The chat's ledger.
 * @returns Whether the current run is orphaned.
 * @internal
 */
export const isOrphaned = (ledger: ChatLedger): boolean => {
  const entry = currentEntry(ledger);
  /* Read tolerantly, execute strictly (D16): a run this build cannot interpret is not written to, not even abandoned. */
  if (executionRefusal(ledger) === 'RUN_UNREADABLE') {
    return false;
  }
  return (
    entry?.lifecycle === 'admitted' ||
    entry?.lifecycle === 'running' ||
    (entry?.lifecycle === 'paused' && entry.kind === 'external')
  );
};

/*
 * The attempt M1 settles next, if any. The current run's ended attempt, when its intent row carries a command id
 * (older runs without a lease have no `turn.*` rows, W8). Then TS-Q5's migration: each lease record opening left held,
 * of a run whose current attempt has ended (a live current run is abandoned first), settles as that attempt; a record
 * written before W5 (attempt 0) names every attempt of its run.
 */
const unsettled = (context: ChatRunContext): Settle | undefined => {
  if (!context.placement) {
    return undefined;
  }
  const runId = context.ledger.currentRunId;
  const entry = currentEntry(context.ledger);
  const keyed = Object.values(context.ledger.applied).some((applied) => applied.runId === runId);
  if (runId !== undefined && entry?.appendState === 'terminal' && keyed) {
    return {
      key: { chatId: context.chatId, turnId: entry.turnId ?? runId, runId, attempt: entry.attempt },
      cut: entry.attempt > 1 || entry.placement !== undefined,
      answered: false,
    };
  }
  for (const key of context.held) {
    const run = context.ledger.runs[key.runId];
    const attempt = key.attempt === 0 ? run?.attempt : key.attempt;
    if (run === undefined || attempt === undefined) {
      continue;
    }
    if (!run.settlements.some((settlement) => key.attempt === 0 || settlement.attempt === attempt)) {
      return { key: { ...key, attempt }, cut: true, answered: false };
    }
  }
  return undefined;
};

const slotFor = (
  context: ChatRunContext,
  input: Readonly<{
    commandId: string;
    verb: 'start' | 'resume';
    runId: string;
    kind?: ChatRunKind;
    checkoutId?: string;
  }>,
): Slot => ({
  commandId: input.commandId,
  verb: input.verb,
  kind: input.kind ?? currentEntry(context.ledger)?.kind ?? 'tau',
  key: { chatId: context.chatId, turnId: input.runId, runId: input.runId, attempt: 0 },
  mode: input.verb === 'start' ? 'start' : 'continue',
  ...(input.checkoutId === undefined ? {} : { checkoutId: input.checkoutId }),
  start: [],
  started: false,
  held: [],
  steers: [],
});

/**
 * A refused placement's `turn.failed`, in the one settlement shape: it states its attempt, as a published settlement
 * does (TS-S9). The log body type leaves `attempt` to the row stamp, which keeps a body's stated one (N4).
 */
const refusedSettlement = (
  chatId: string,
  key: TurnAttemptKey,
  refusal: Readonly<{ reason: string; code: string; revisionId?: string }>,
): LogRowBody => {
  const row: Omit<Extract<TurnSettlementRow, { type: 'turn.failed' }>, 'runId'> = {
    type: 'turn.failed',
    chatId,
    turnId: key.turnId,
    attempt: key.attempt,
    ...refusal,
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stated attempt rides the body (N4).
  return row as LogRowBody;
};

const sameAttempt = (slot: Slot, key: TurnAttemptKey): boolean =>
  key.runId === slot.key.runId && key.attempt === slot.key.attempt;

const held = (event: Readonly<{ type: HeldCommand['type']; commandId: string; payload: unknown }>): HeldCommand => ({
  type: event.type,
  commandId: event.commandId,
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a validated wire payload is JSON by construction.
  payload: event.payload as JsonValue,
});

/** A resumable run the reopen predicate lets continue (I10). */
const resumable = (entry: RunEntry | undefined): boolean => {
  if (entry?.lifecycle === undefined) {
    return false;
  }
  if (entry.lifecycle === 'paused') {
    return entry.kind === 'tau' && Object.keys(entry.pendingInterrupts).length === 0;
  }
  if (!isResumableRun(entry)) {
    return false;
  }
  return entry.appendState !== 'settled' || reopens(entry, { state: 'running' });
};

/** Whether a context still carries an attempt's slot (MC-R26 allows it only while an attempt holds the chat). */
const hasSlot = (context: ChatRunContext & Readonly<{ slot?: Slot }>): boolean => context.slot !== undefined;

/** A refusal whose effect is unknown or that names a newer writer: the incarnation fences. */
const fencedBy = (event: Readonly<{ code: string; effect?: string }>): boolean =>
  event.effect === 'unknown' || event.code === 'LOG_FENCED';

/** The slot at the stop bound: the driver did not stop, so the attempt ends `aborted`. */
const stoppedAt = (context: SlotContext): SlotContext => ({
  ...context,
  slot: { ...context.slot, ending: { ...(context.slot.ending ?? { reason: 'ended' }), outcome: 'aborted' } },
});

/** The checkout attempt 1's `running` row placed the run on, if it was placed. */
const runCheckout = (ledger: ChatLedger, runId: string): string | undefined =>
  ledger.runs[runId]?.placement?.checkoutId;

const settlementOf = (ledger: ChatLedger, key: TurnAttemptKey): boolean =>
  ledger.runs[key.runId]?.settlements.some((settlement) => settlement.attempt === key.attempt) === true;

// ── transition helpers: pure except for the effects they enqueue ─────────────────────────────────

/** The machine's `enq`, as the helpers below call it. */
// oxlint-disable-next-line typescript/no-explicit-any -- mirrors xstate's EnqueueObject call signature.
type Enq = <T extends (...args: any[]) => any>(function_: T, ...args: Parameters<T>) => void;

/** The custom actions M1 declares, as the helpers below enqueue them. */
type Effects = { readonly [Name in keyof ChatRunEffectArgs]: (args: ChatRunEffectArgs[Name]) => void };

const keysMatch = (left: TurnAttemptKey, right: TurnAttemptKey): boolean =>
  left.runId === right.runId && left.attempt === right.attempt;

/** What a helper hands its transition: where the attempt goes, its context, and the spec action it refines. */
type AttemptStep = Readonly<{
  target: '#recording' | '#runningTau' | '#runningExternal' | '#starting' | '#awaitingDecision';
  context: SlotContext;
}>;

/** Enqueue the ending batch; the driver's gate for the attempt closes before it lands (RA-R6). */
const record = (enq: Enq, actions: Effects, context: SlotContext): AttemptStep => {
  const next = minted(context, 'ending');
  enq(actions.appendRows, { key: next.key, rows: endingRows(context), ends: context.slot.key });
  return {
    target: '#recording',
    context: { ...context, seq: next.seq, pending: next.key },
  };
};

/** Start the driver, unless a held cancel or a close ends the attempt first (the attempt then never executed). */
const launch = (enq: Enq, actions: Effects, context: SlotContext): AttemptStep => {
  const { slot } = context;
  const cancel = slot.held.find((command) => command.type === 'cancel');
  if (cancel !== undefined) {
    return record(enq, actions, {
      ...context,
      slot: {
        ...slot,
        held: slot.held.filter((command) => command !== cancel),
        ending: { reason: 'cancel', commandId: cancel.commandId, outcome: 'aborted' },
      },
    });
  }
  if (context.cause !== undefined) {
    return record(enq, actions, { ...context, slot: { ...slot, ending: { reason: 'close', outcome: 'aborted' } } });
  }
  if (slot.mode === 'complete') {
    /* The tail already answers the turn: the attempt ends with no call. */
    return record(enq, actions, { ...context, slot: { ...slot, ending: { reason: 'ended', outcome: 'completed' } } });
  }
  enq(actions.startDriver, {
    key: slot.key,
    kind: slot.kind,
    mode: slot.mode,
    ...(slot.placement === undefined ? {} : { placement: slot.placement }),
  });
  const steers = slot.held.filter((command) => command.type === 'steer');
  for (const steer of steers) {
    const payload = steer.payload as Readonly<{ message?: string }>;
    enq(actions.steerDriver, { key: slot.key, commandId: steer.commandId, message: payload.message ?? '' });
  }
  const others = slot.held.filter((command) => command.type !== 'steer');
  if (others.length > 0) {
    enq(actions.redeliver, { commands: others });
  }
  return {
    target: slot.kind === 'tau' ? '#runningTau' : '#runningExternal',
    context: {
      ...context,
      slot: {
        ...slot,
        started: true,
        held: [],
        steers: [...slot.steers, ...steers.map((steer) => steer.commandId)],
      },
    },
  };
};

/** After intent (and placement): attempt 1 writes its start rows and `running{placement}`; a resume starts now. */
const startOrEnd = (enq: Enq, actions: Effects, context: SlotContext): AttemptStep => {
  const { slot } = context;
  if (slot.verb !== 'start' || slot.held.some((command) => command.type === 'cancel') || context.cause !== undefined) {
    return launch(enq, actions, context);
  }
  const next = minted(context, 'start');
  enq(actions.appendRows, {
    key: next.key,
    rows: [...slot.start, lifecycle('running', slot.placement === undefined ? {} : { placement: slot.placement })].map(
      (body) => ({ runId: slot.key.runId, body }),
    ),
  });
  return { target: '#starting', context: { ...context, seq: next.seq, pending: next.key } };
};

/** An external agent asked a person: `[requested, paused]` are durable before anyone can answer (I18). */
const request = (
  enq: Enq,
  actions: Effects,
  {
    context,
    interruptId,
    request: asked,
  }: Readonly<{
    context: SlotContext;
    interruptId: string;
    request: ApprovalRequest;
  }>,
): AttemptStep | Readonly<Record<never, never>> => {
  const { runId } = context.slot.key;
  const entry = context.ledger.runs[runId];
  if (entry?.pendingInterrupts[interruptId] !== undefined) {
    /* A duplicate of a pending request: the first one stands (L2a D11). */
    return {};
  }
  const next = minted(context, 'request');
  enq(actions.appendRows, {
    key: next.key,
    rows: [
      {
        type: 'interrupt.recorded',
        interruptId,
        phase: 'requested',
        reason: asked.prompt,
        payload: {
          kind: 'approval',
          prompt: asked.prompt,
          ...(asked.agentId === undefined ? {} : { agentId: asked.agentId }),
          ...(asked.payload === undefined ? {} : { context: asked.payload }),
        },
      } satisfies LogRowBody,
      ...(entry?.lifecycle === 'paused' ? [] : [lifecycle('paused')]),
    ].map((body) => ({ runId, body })),
  });
  return {
    target: '#awaitingDecision',
    context: { ...context, seq: next.seq, pending: next.key },
  };
};

/** A resolution whose row landed while the run was ending is answered from the ledger; the driver is stopping. */
const decisionAnswered = (enq: Enq, actions: Effects, context: SlotContext): Slot => {
  const { decision } = context.slot;
  if (decision === undefined || !context.ledger.applied[decision.commandId]) {
    return context.slot;
  }
  enq(actions.answer, { answer: durable(context.ledger, decision.commandId) });
  return { ...context.slot, decision: undefined };
};

/** The ending batch landed: a resolution still unanswered is answered, applied if its row is durable. */
const decisionAnsweredOrRefused = (enq: Enq, actions: Effects, context: SlotContext): Slot => {
  const slot = decisionAnswered(enq, actions, context);
  if (slot.decision !== undefined) {
    enq(actions.answer, {
      answer: notPending(context, slot.decision.commandId, {
        interruptId: slot.decision.resolution.interruptId,
        runId: slot.key.runId,
      }),
    });
  }
  return { ...slot, decision: undefined };
};

/** M1's own append in `running` landed: a resolution is answered and handed to the driver after its row (I18). */
const settleDecision = (enq: Enq, actions: Effects, context: SlotContext): AttemptStep => {
  const { decision } = context.slot;
  if (decision === undefined) {
    return { target: '#awaitingDecision', context };
  }
  enq(actions.answer, { answer: durable(context.ledger, decision.commandId) });
  enq(actions.decideApproval, { key: context.slot.key, resolution: decision.resolution });
  const slot: Slot = { ...context.slot, decision: undefined };
  return context.ledger.runs[slot.key.runId]?.lifecycle === 'running'
    ? { target: '#runningExternal', context: { ...context, slot } }
    : { target: '#awaitingDecision', context: { ...context, slot } };
};

const externalUnsupported = (
  enq: Enq,
  actions: Effects,
  { context, commandId }: Readonly<{ context: ChatRunContext; commandId: string }>,
): Readonly<Record<never, never>> => {
  enq(actions.answer, {
    answer: context.ledger.applied[commandId]
      ? durable(context.ledger, commandId, 'replayed')
      : refused(context.ledger, commandId, {
          code: 'EXTERNAL_AGENT_UNSUPPORTED',
          message: 'An external agent cannot be steered or interrupted mid-turn.',
        }),
  });
  return {};
};

// ── the machine ───────────────────────────────────────────────────────────────────────────────────

const notProvided = (name: keyof ChatRunEffectArgs): never => {
  throw new Error(`chatRun: the ${name} effect was not provided; createChatRunActor provides every effect.`);
};

export const chatRunMachine = setup({
  schemas: {
    context: types<ChatRunContext>(),
    input: types<ChatRunInput>(),
    events: {
      ...chatRunCommandSchemas,
      logOpened: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'logOpened' }>, 'type'>>(),
      logOpenFailed: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'logOpenFailed' }>, 'type'>>(),
      rowsCommitted: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'rowsCommitted' }>, 'type'>>(),
      appendRefused: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'appendRefused' }>, 'type'>>(),
      admissionPrepared: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'admissionPrepared' }>, 'type'>>(),
      admissionRefused: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'admissionRefused' }>, 'type'>>(),
      resumePrepared: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'resumePrepared' }>, 'type'>>(),
      resumeRefused: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'resumeRefused' }>, 'type'>>(),
      placed: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'placed' }>, 'type'>>(),
      placementRefused: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'placementRefused' }>, 'type'>>(),
      completeAnswered: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'completeAnswered' }>, 'type'>>(),
      settlementPublished: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'settlementPublished' }>, 'type'>>(),
      acknowledged: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'acknowledged' }>, 'type'>>(),
      abandoned: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'abandoned' }>, 'type'>>(),
      agentEnded: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'agentEnded' }>, 'type'>>(),
      approvalRequested: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'approvalRequested' }>, 'type'>>(),
      logClosed: types<Omit<Extract<ChatRunOutcomeEvent, { type: 'logClosed' }>, 'type'>>(),
      close: types<Omit<Extract<ChatRunHostEvent, { type: 'close' }>, 'type'>>(),
      relinquish: types<Omit<Extract<ChatRunHostEvent, { type: 'relinquish' }>, 'type'>>(),
    },
    tags: types<'slotHeld' | 'serving' | 'quiescent' | 'refusingWrites'>(),
    transitionMeta: types<{ tla: ChatRunTransitionLabel }>(),
  },
  states: {
    opening: { id: 'opening' },
    reconciling: { id: 'reconciling' },
    idle: {
      id: 'idle',
      states: {
        choosing: {},
        orphaned: { id: 'orphaned' },
        writing: { id: 'writing', schemas: { context: withWrite } },
        paused: { id: 'paused' },
        free: { id: 'free' },
      },
    },
    reserving: {
      id: 'reserving',
      schemas: { context: withSlot },
      states: {
        validating: { id: 'validating', schemas: { context: withSlot } },
        journaling: { id: 'journaling', schemas: { context: withSlot } },
        placing: { id: 'placing', schemas: { context: withSlot } },
        starting: { id: 'starting', schemas: { context: withSlot } },
      },
    },
    running: {
      id: 'running',
      schemas: { context: withSlot },
      states: {
        tau: { id: 'runningTau', schemas: { context: withSlot } },
        external: { id: 'runningExternal', schemas: { context: withSlot } },
        awaitingDecision: { id: 'awaitingDecision', schemas: { context: withSlot } },
      },
    },
    ending: {
      id: 'ending',
      schemas: { context: withSlot },
      states: {
        stopping: { id: 'stopping', schemas: { context: withSlot } },
        fencing: { id: 'fencing', schemas: { context: withSlot } },
        recording: { id: 'recording', schemas: { context: withSlot } },
      },
    },
    settling: {
      id: 'settling',
      schemas: { context: withSettle },
      states: {
        finishing: { id: 'finishing', schemas: { context: withSettle } },
        backingOff: { id: 'backingOff', schemas: { context: withSettle } },
        appending: { id: 'appending', schemas: { context: withSettle } },
        retiring: { id: 'retiring', schemas: { context: withSettle } },
      },
    },
    closing: { id: 'closing' },
    closed: { id: 'closed' },
  },
  actions: {
    openLog: (_args: ChatRunEffectArgs['openLog']): void => notProvided('openLog'),
    appendRows: (_args: ChatRunEffectArgs['appendRows']): void => notProvided('appendRows'),
    prepareAdmission: (_args: ChatRunEffectArgs['prepareAdmission']): void => notProvided('prepareAdmission'),
    prepareResume: (_args: ChatRunEffectArgs['prepareResume']): void => notProvided('prepareResume'),
    startDriver: (_args: ChatRunEffectArgs['startDriver']): void => notProvided('startDriver'),
    steerDriver: (_args: ChatRunEffectArgs['steerDriver']): void => notProvided('steerDriver'),
    abortDriver: (_args: ChatRunEffectArgs['abortDriver']): void => notProvided('abortDriver'),
    decideApproval: (_args: ChatRunEffectArgs['decideApproval']): void => notProvided('decideApproval'),
    admitPlacement: (_args: ChatRunEffectArgs['admitPlacement']): void => notProvided('admitPlacement'),
    completePlacement: (_args: ChatRunEffectArgs['completePlacement']): void => notProvided('completePlacement'),
    abandonPlacement: (_args: ChatRunEffectArgs['abandonPlacement']): void => notProvided('abandonPlacement'),
    acknowledgePlacement: (_args: ChatRunEffectArgs['acknowledgePlacement']): void =>
      notProvided('acknowledgePlacement'),
    closeLog: (_args: ChatRunEffectArgs['closeLog']): void => notProvided('closeLog'),
    answer: (_args: ChatRunEffectArgs['answer']): void => notProvided('answer'),
    redeliver: (_args: ChatRunEffectArgs['redeliver']): void => notProvided('redeliver'),
  },
  delays: {
    /* Placeholders: the factory provides ChatRunDeps.delays (RV4). */
    idleEviction: 300_000,
    driverStopBound: 30_000,
    cutRetry: 1000,
  },
}).createMachine({
  id: 'chat-run',
  version: '1',
  context: ({ input }) => ({
    chatId: input.chatId,
    leaderEpoch: input.leaderEpoch,
    placement: input.placement,
    ledger: {
      semanticLeaderEpoch: undefined,
      position: { cursor: 0 },
      terms: {},
      maxEpoch: 0,
      runs: {},
      applied: {},
      invocations: {},
      historyIntact: true,
      newerHistory: false,
      anomalies: [],
    },
    held: [],
    seq: 0,
    pending: undefined,
    takeover: false,
    cause: undefined,
    failure: undefined,
  }),
  initial: 'opening',
  /* A fault fences the incarnation: nothing more is written, and W6 rereads on the next command (L4 D-092). */
  /* A fault while an attempt holds a lease abandons it (TS-R15); M1 closes. */
  onError: refines('Unmodelled', ({ context, actions }, enq) => {
    const { slot } = context as ChatRunContext & Readonly<{ slot?: Slot }>;
    if (slot !== undefined && slot.key.attempt > 0 && context.placement) {
      enq(actions.abandonPlacement, { key: slot.key });
    }
    return { target: '#closing', context: { ...context, cause: 'fault' } };
  }),
  on: {
    /* Defaults every serving state narrows. Each answers from the applied set first (RA-R2). */
    start: refines('start', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : liveRefusal(context, event.commandId),
      });
      return {};
    }),
    resume: refines('resume', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : liveRefusal(context, event.commandId),
      });
      return {};
    }),
    cancel: refines('cancel', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : liveRefusal(context, event.commandId),
      });
      return {};
    }),
    steer: refines('steer', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : notLive(context, event.commandId, event.payload.runId),
      });
      return {};
    }),
    interrupt: refines('interrupt', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : notLive(context, event.commandId, event.payload.runId),
      });
      return {};
    }),
    'resolve-interrupt': refines('resolveInterrupt', ({ context, event, actions }, enq) => {
      enq(actions.answer, {
        answer: context.ledger.applied[event.commandId]
          ? durable(context.ledger, event.commandId, 'replayed')
          : notPending(context, event.commandId, event.payload),
      });
      return {};
    }),
    /* A driver's own rows: the ledger only moves forward. M1's keyed commits are handled where one is pending. */
    rowsCommitted: refines('rowsCommitted', ({ context, event }) => ({
      context: { ...context, ledger: newer(context.ledger, event.ledger) },
    })),
    /* Stale outcomes: nothing in this state asked for them (MC-R18). */
    appendRefused: refines('logFenced', () => ({})),
    admissionPrepared: refines('admissionPrepared', () => ({})),
    admissionRefused: refines('admissionRefused', () => ({})),
    resumePrepared: refines('resumePrepared', () => ({})),
    resumeRefused: refines('resumeRefused', () => ({})),
    placed: refines('placed', () => ({})),
    placementRefused: refines('placementRefused', () => ({})),
    completeAnswered: refines('complete', () => ({})),
    settlementPublished: refines('settlementPublished', () => ({})),
    acknowledged: refines('acknowledge', () => ({})),
    abandoned: refines('abandoned', () => ({})),
    agentEnded: refines('agentEnded', () => ({})),
    approvalRequested: refines('approvalRequested', () => ({})),
    logOpened: refines('logOpened', () => ({})),
    logOpenFailed: refines('Unmodelled', () => ({})),
    logClosed: refines('logClosed', () => ({})),
    close: refines('close', ({ context }) => ({
      target: '#closing',
      context: { ...context, cause: context.cause ?? 'close' },
    })),
    relinquish: refines('relinquish', ({ context }) => ({
      target: '#closing',
      context: { ...context, cause: 'relinquish' },
    })),
  },
  states: {
    /* Read and fold; nothing is written (D5). The registry delivers no command until M1 serves. */
    opening: {
      tags: ['refusingWrites'],
      entry: ({ context, actions }, enq) => {
        enq(actions.openLog, { chatId: context.chatId });
      },
      on: {
        logOpened: refines('logOpened', ({ context, event, actions }, enq) => {
          const held = event.held ?? [];
          if (event.repair.length === 0) {
            return { target: '#idle', context: { ...context, ledger: event.ledger, held } };
          }
          const next = minted(context, 'reconcile');
          enq(actions.appendRows, { key: next.key, rows: event.repair });
          return {
            target: '#reconciling',
            context: { ...context, ledger: event.ledger, held, seq: next.seq, pending: next.key },
          };
        }),
        logOpenFailed: refines('Unmodelled', ({ context, event }) => ({
          target: '#closed',
          context: { ...context, cause: 'openFailed', failure: { code: event.code, message: event.message } },
        })),
        close: refines('close', ({ context }) => ({
          target: '#closing',
          context: { ...context, cause: context.cause ?? 'close' },
        })),
      },
    },
    /* Split-admission repair and resolved model attempts: facts, not a command's effect, so they carry no command id. */
    reconciling: {
      tags: ['refusingWrites'],
      on: {
        rowsCommitted: refines('rowsCommitted', ({ context, event }) =>
          event.key === context.pending
            ? {
                target: '#idle',
                context: { ...context, ledger: newer(context.ledger, event.ledger), pending: undefined },
              }
            : { context: { ...context, ledger: newer(context.ledger, event.ledger) } },
        ),
        appendRefused: refines('logFenced', ({ context, event }) =>
          event.key === context.pending
            ? { target: '#closing', context: { ...context, cause: 'fenced', pending: undefined } }
            : {},
        ),
      },
    },
    idle: {
      initial: 'choosing',
      /* MC-R26: the slot is memory of one attempt; resting holds none, whichever transition brought M1 here. */
      entry: ({ context }) => (hasSlot(context) ? { context: { slot: undefined } } : {}),
      states: {
        /* The total choice every return to rest makes (RA-R9, RA-R12). */
        choosing: {
          type: 'choice',
          choice: ({ context }) => {
            if (context.cause !== undefined) {
              return { target: '#closing' };
            }
            if (isOrphaned(context.ledger)) {
              return { target: '#orphaned' };
            }
            if (unsettled(context) !== undefined) {
              return { target: '#finishing', context: { settle: unsettled(context) } };
            }
            return currentEntry(context.ledger)?.lifecycle === 'paused' ? { target: '#paused' } : { target: '#free' };
          },
        },
        /* Abandonment happens only here, at opening, as the term's claim (RA-R9, I13). */
        orphaned: {
          tags: ['refusingWrites'],
          entry: ({ context, actions }, enq) => {
            enq(actions.appendRows, { key: `abandon:${String(context.seq)}`, rows: orphanRows(context.ledger) });
          },
          on: {
            rowsCommitted: refines('markAbandoned', ({ context, event }) =>
              event.key === `abandon:${String(context.seq)}`
                ? {
                    target: '#idle',
                    context: {
                      ...context,
                      ledger: newer(context.ledger, event.ledger),
                      seq: context.seq + 1,
                      takeover: true,
                    },
                  }
                : { context: { ...context, ledger: newer(context.ledger, event.ledger) } },
            ),
            /* A stale writer appended after the read: the claim failed, and W6 rereads (RA-A9). */
            appendRefused: refines('logFenced', ({ context, event }) =>
              event.key === `abandon:${String(context.seq)}`
                ? { target: '#closing', context: { ...context, cause: 'fenced' } }
                : {},
            ),
          },
        },
        /* A decision batch outside a slot: a paused run's resolution or cancel. */
        writing: {
          on: {
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              if (event.key !== context.pending) {
                return { context: { ...context, ledger } };
              }
              enq(actions.answer, { answer: durable(ledger, context.write.commandId) });
              return { target: '#idle', context: { ...context, ledger, pending: undefined } };
            }),
            /* A gate refusal that leaves the log unchanged returns to rest: not the spec's `logFenced`. */
            appendRefused: branches(
              refines('Unmodelled', ({ context, event, actions }, enq) => {
                if (event.key !== context.pending || fencedBy(event)) {
                  return undefined;
                }
                enq(actions.answer, { answer: refused(context.ledger, context.write.commandId, event) });
                return { target: '#idle', context: { ...context, pending: undefined } };
              }),
              refines('logFenced', ({ context, event, actions }, enq) => {
                if (event.key !== context.pending) {
                  return {};
                }
                enq(actions.answer, { answer: refused(context.ledger, context.write.commandId, event) });
                return { target: '#closing', context: { ...context, pending: undefined, cause: 'fenced' } };
              }),
            ),
          },
        },
        /* A native pause rests here after its attempt settled (TS-R10); a person's decision is not a reservation (D10). */
        paused: {
          tags: ['serving', 'quiescent'],
          after: {
            idleEviction: refines('Unmodelled', ({ context }) => ({
              target: '#closing',
              context: { ...context, cause: 'evicted' },
            })),
          },
          on: {
            resume: refines('resume', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const entry = currentEntry(context.ledger);
              if (event.payload.runId !== context.ledger.currentRunId) {
                enq(actions.answer, {
                  answer: refused(context.ledger, event.commandId, {
                    code: 'RESUME_UNAVAILABLE',
                    message: `Run ${event.payload.runId} is not this chat's current run.`,
                  }),
                });
                return {};
              }
              if (Object.keys(entry?.pendingInterrupts ?? {}).length > 0) {
                enq(actions.answer, {
                  answer: refused(context.ledger, event.commandId, {
                    code: 'INTERRUPT_PENDING',
                    message: 'Resolve the pending request before resuming this run.',
                    details: { interruptIds: Object.keys(entry?.pendingInterrupts ?? {}) },
                  }),
                });
                return {};
              }
              enq(actions.prepareResume, {
                commandId: event.commandId,
                runId: event.payload.runId,
                // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a validated wire payload is JSON.
                payload: event.payload as JsonValue,
              });
              return {
                target: '#validating',
                context: {
                  ...context,
                  slot: slotFor(context, { commandId: event.commandId, verb: 'resume', runId: event.payload.runId }),
                },
              };
            }),
            cancel: refines('cancel', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const runId = context.ledger.currentRunId;
              if (event.payload.runId !== runId) {
                enq(actions.answer, { answer: notLive(context, event.commandId, event.payload.runId) });
                return {};
              }
              const next = minted(context, 'cancel');
              enq(actions.appendRows, {
                key: next.key,
                rows: [
                  ...cancelPending(context.ledger, runId),
                  lifecycle(
                    'cancelled',
                    context.ledger.runs[runId]?.committed
                      ? { detail: { code: 'USER_STOPPED', message: 'You stopped this turn. Resume to continue it.' } }
                      : {},
                  ),
                ].map((body) => ({
                  runId,
                  body,
                  commandId: event.commandId,
                })),
              });
              return {
                target: '#writing',
                context: { ...context, seq: next.seq, pending: next.key, write: { commandId: event.commandId } },
              };
            }),
            'resolve-interrupt': refines('resolveInterrupt', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const { runId, interruptId } = event.payload;
              if (context.ledger.runs[runId]?.pendingInterrupts[interruptId] === undefined) {
                enq(actions.answer, { answer: notPending(context, event.commandId, event.payload) });
                return {};
              }
              const next = minted(context, 'resolve');
              /* A denied or cancelled request ends the paused run: nothing will continue it (V8). */
              const stillPending = Object.keys(context.ledger.runs[runId].pendingInterrupts).filter(
                (id) => id !== interruptId,
              );
              enq(actions.appendRows, {
                key: next.key,
                rows: [
                  resolvedRow({
                    interruptId,
                    outcome: event.payload.outcome,
                    ...(event.payload.optionId === undefined ? {} : { optionId: event.payload.optionId }),
                    ...(event.payload.payload === undefined ? {} : { payload: event.payload.payload }),
                  }),
                  ...(event.payload.outcome === 'approved' || stillPending.length > 0 ? [] : [lifecycle('cancelled')]),
                ].map((body) => ({ runId, commandId: event.commandId, body })),
              });
              return {
                target: '#writing',
                context: { ...context, seq: next.seq, pending: next.key, write: { commandId: event.commandId } },
              };
            }),
          },
        },
        free: {
          tags: ['serving', 'quiescent'],
          after: {
            idleEviction: refines('Unmodelled', ({ context }) => ({
              target: '#closing',
              context: { ...context, cause: 'evicted' },
            })),
          },
          on: {
            start: refines('start', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const unreadable = executionRefusal(context.ledger);
              if (unreadable !== undefined) {
                enq(actions.answer, {
                  answer: refused(context.ledger, event.commandId, {
                    code: unreadable,
                    message:
                      unreadable === 'RUN_UNREADABLE'
                        ? `A newer version of Tau wrote part of chat ${context.chatId}. Update Tau to continue it.`
                        : `Chat ${context.chatId}'s history cannot be replayed; start a new chat.`,
                  }),
                });
                return {};
              }
              /* A lifecycle row is what takes a run id; a settlement written under it does not. */
              if (context.ledger.runs[event.payload.runId]?.lifecycle !== undefined) {
                enq(actions.answer, {
                  answer: refused(context.ledger, event.commandId, {
                    code: 'RUN_ID_TAKEN',
                    message: `Run ${event.payload.runId} has already been admitted; mint a new run id.`,
                    details: { runId: event.payload.runId },
                  }),
                });
                return {};
              }
              enq(actions.prepareAdmission, {
                commandId: event.commandId,
                // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a validated wire payload is JSON.
                payload: event.payload as JsonValue,
              });
              return {
                target: '#validating',
                context: {
                  ...context,
                  slot: slotFor(context, {
                    commandId: event.commandId,
                    verb: 'start',
                    runId: event.payload.runId,
                    ...(event.payload.checkoutId === undefined ? {} : { checkoutId: event.payload.checkoutId }),
                  }),
                },
              };
            }),
            resume: refines('resume', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const entry = currentEntry(context.ledger);
              const unreadable = executionRefusal(context.ledger);
              if (
                event.payload.runId !== context.ledger.currentRunId ||
                unreadable !== undefined ||
                !resumable(entry)
              ) {
                enq(actions.answer, {
                  answer: refused(context.ledger, event.commandId, {
                    code: unreadable ?? 'RESUME_UNAVAILABLE',
                    message:
                      event.payload.runId === context.ledger.currentRunId
                        ? `Run ${event.payload.runId} cannot be continued; try the turn again.`
                        : `Run ${event.payload.runId} is not this chat's current run.`,
                    details: {
                      state: runState(context.ledger),
                      ...(context.ledger.currentRunId === undefined
                        ? {}
                        : { currentRunId: context.ledger.currentRunId }),
                    },
                  }),
                });
                return {};
              }
              enq(actions.prepareResume, {
                commandId: event.commandId,
                runId: event.payload.runId,
                // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a validated wire payload is JSON.
                payload: event.payload as JsonValue,
              });
              return {
                target: '#validating',
                context: {
                  ...context,
                  slot: slotFor(context, { commandId: event.commandId, verb: 'resume', runId: event.payload.runId }),
                },
              };
            }),
            cancel: refines('cancel', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const entry = context.ledger.runs[event.payload.runId];
              enq(actions.answer, {
                answer:
                  entry?.lifecycle === undefined
                    ? refused(context.ledger, event.commandId, {
                        code: 'NO_RUN_ADMITTED',
                        message: `Run ${event.payload.runId} was never admitted in chat ${context.chatId}.`,
                      })
                    : nothingToDo(context.ledger, event.commandId, {
                        state: entry.lifecycle,
                        runId: event.payload.runId,
                      }),
              });
              return {};
            }),
          },
        },
      },
    },
    reserving: {
      /* Entered only by `#id` targets; alpha.59 requires the initial anyway. */
      initial: 'validating',
      tags: ['slotHeld'],
      on: {
        /* D3: a slot with no row yet is `reserved`, memory-only. */
        start: refines('start', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : liveRefusal(context, event.commandId, context.slot.key.attempt === 0 ? 'reserved' : undefined),
          });
          return {};
        }),
        /* The totality matrix's `Q`: a cancel or steer for this run waits for the reservation to end. */
        cancel: refines('cancel', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          if (event.payload.runId !== context.slot.key.runId) {
            enq(actions.answer, { answer: liveRefusal(context, event.commandId) });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        steer: refines('steer', ({ context, event, actions }, enq) => {
          if (event.payload.runId !== context.slot.key.runId || context.slot.kind !== 'tau') {
            enq(actions.answer, { answer: notLive(context, event.commandId, event.payload.runId) });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        /* An interrupt or resume for this run is answered by the running attempt: held, re-delivered at launch. */
        interrupt: refines('interrupt', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          if (event.payload.runId !== context.slot.key.runId) {
            enq(actions.answer, { answer: notLive(context, event.commandId, event.payload.runId) });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        resume: refines('resume', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          if (event.payload.runId !== context.slot.key.runId) {
            enq(actions.answer, { answer: liveRefusal(context, event.commandId) });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        /* Nothing is written before journaling durable; later phases finish, then end with reason `close`. */
        close: refines('close', ({ context }) => ({ context: { ...context, cause: context.cause ?? 'close' } })),
        relinquish: refines('relinquish', ({ context, actions }, enq) => {
          if (context.slot.key.attempt === 0) {
            enq(actions.answer, { answer: liveRefusal({ ...context, cause: 'relinquish' }, context.slot.commandId) });
          }
          return { target: '#closing', context: { ...context, cause: 'relinquish' } };
        }),
      },
      states: {
        /* No row of the command yet (RA-R4): a refusal here leaves the log as it was. */
        validating: {
          on: {
            admissionPrepared: refines('admissionPrepared', ({ context, event, actions }, enq) => {
              if (event.commandId !== context.slot.commandId) {
                return {};
              }
              const { prepared } = event;
              const next = minted(context, 'intent');
              enq(actions.appendRows, {
                key: next.key,
                rows: prepared.intent.map((body) => ({
                  runId: context.slot.key.runId,
                  body,
                  commandId: event.commandId,
                })),
              });
              return {
                target: '#journaling',
                context: {
                  ...context,
                  seq: next.seq,
                  pending: next.key,
                  slot: {
                    ...context.slot,
                    kind: prepared.kind,
                    key: { ...context.slot.key, turnId: prepared.turnId },
                    start: prepared.start,
                    ...(prepared.checkoutId === undefined ? {} : { checkoutId: prepared.checkoutId }),
                  },
                },
              };
            }),
            resumePrepared: refines('resumePrepared', ({ context, event, actions }, enq) => {
              if (event.commandId !== context.slot.commandId) {
                return {};
              }
              const { prepared } = event;
              const next = minted(context, 'intent');
              enq(actions.appendRows, {
                key: next.key,
                /* A settled row records the gateway's answer, not the command: it carries no command id (spec). */
                rows: prepared.intent.map((body) =>
                  body.type === 'model.invocation-settled'
                    ? { runId: context.slot.key.runId, body }
                    : { runId: context.slot.key.runId, body, commandId: event.commandId },
                ),
              });
              return {
                target: '#journaling',
                context: {
                  ...context,
                  seq: next.seq,
                  pending: next.key,
                  slot: {
                    ...context.slot,
                    kind: prepared.kind,
                    mode: prepared.mode,
                    key: { ...context.slot.key, turnId: prepared.turnId },
                    /* A resumed attempt is placed on the run's checkout of record, under a new lease (TS-R12). */
                    ...(runCheckout(context.ledger, context.slot.key.runId) === undefined
                      ? {}
                      : { checkoutId: runCheckout(context.ledger, context.slot.key.runId) }),
                  },
                },
              };
            }),
            admissionRefused: refines('admissionRefused', ({ context, event, actions }, enq) => {
              if (event.commandId !== context.slot.commandId) {
                return {};
              }
              enq(actions.answer, { answer: refused(context.ledger, event.commandId, event) });
              for (const command of context.slot.held) {
                enq(actions.answer, {
                  answer:
                    command.type === 'cancel'
                      ? refused(context.ledger, command.commandId, {
                          code: 'NO_RUN_ADMITTED',
                          message: 'The run this cancel named was refused before it was admitted.',
                        })
                      : notLive(context, command.commandId, context.slot.key.runId),
                });
              }
              return { target: '#idle' };
            }),
            resumeRefused: refines('resumeRefused', ({ context, event, actions }, enq) => {
              if (event.commandId !== context.slot.commandId) {
                return {};
              }
              enq(actions.answer, { answer: refused(context.ledger, event.commandId, event) });
              enq(actions.redeliver, { commands: context.slot.held });
              return { target: '#idle' };
            }),
            close: refines('close', ({ context, actions }, enq) => {
              enq(actions.answer, { answer: liveRefusal({ ...context, cause: 'close' }, context.slot.commandId) });
              return { target: '#closing', context: { ...context, cause: 'close' } };
            }),
          },
        },
        /* The intent batch is appending; it is the command's answer (I18). */
        journaling: {
          on: {
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              if (event.key !== context.pending) {
                return { context: { ...context, ledger } };
              }
              enq(actions.answer, { answer: durable(ledger, context.slot.commandId) });
              const entry = ledger.runs[context.slot.key.runId];
              const slot: Slot = {
                ...context.slot,
                key: {
                  ...context.slot.key,
                  attempt: entry?.attempt ?? 1,
                  turnId: entry?.turnId ?? context.slot.key.turnId,
                },
              };
              if (context.placement) {
                enq(actions.admitPlacement, {
                  key: slot.key,
                  ...(slot.checkoutId === undefined ? {} : { checkoutId: slot.checkoutId }),
                });
                return { target: '#placing', context: { ...context, ledger, pending: undefined, slot } };
              }
              return startOrEnd(enq, actions, { ...context, ledger, pending: undefined, slot });
            }),
            /* A gate refusal that leaves the log unchanged returns to rest: not the spec's `logFenced`. */
            appendRefused: branches(
              refines('Unmodelled', ({ context, event, actions }, enq) => {
                if (event.key !== context.pending || fencedBy(event)) {
                  return undefined;
                }
                enq(actions.answer, { answer: refused(context.ledger, context.slot.commandId, event) });
                enq(actions.redeliver, { commands: context.slot.held });
                return { target: '#idle', context: { ...context, pending: undefined } };
              }),
              refines('logFenced', ({ context, event, actions }, enq) => {
                if (event.key !== context.pending) {
                  return {};
                }
                enq(actions.answer, { answer: refused(context.ledger, context.slot.commandId, event) });
                enq(actions.redeliver, { commands: context.slot.held });
                return { target: '#closing', context: { ...context, pending: undefined, cause: 'fenced' } };
              }),
            ),
          },
        },
        placing: {
          on: {
            placed: refines('placed', ({ context, event, actions }, enq) => {
              if (!sameAttempt(context.slot, event.key)) {
                return {};
              }
              return startOrEnd(enq, actions, { ...context, slot: { ...context.slot, placement: event.placement } });
            }),
            placementRefused: refines('placementRefused', ({ context, event, actions }, enq) => {
              if (!sameAttempt(context.slot, event.key)) {
                return {};
              }
              const failure = {
                code: event.effect === 'unknown' ? 'RUN_ABANDONED' : event.code,
                message: event.message,
              };
              const slot: Slot = {
                ...context.slot,
                ending: {
                  reason: 'refused',
                  failure,
                  ...(event.effect === 'unknown'
                    ? {}
                    : {
                        settlement: refusedSettlement(context.chatId, context.slot.key, {
                          reason: event.message,
                          code: endingFailure(failure).code ?? failure.code,
                          ...(event.revisionId === undefined ? {} : { revisionId: event.revisionId }),
                        }),
                      }),
                },
              };
              return record(enq, actions, {
                ...context,
                slot,
                ...(event.effect === 'unknown' ? { cause: context.cause ?? 'fenced' } : {}),
              });
            }),
          },
        },
        /* Attempt 1's `running{placement}` row, then the driver. */
        starting: {
          on: {
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              if (event.key !== context.pending) {
                return { context: { ...context, ledger } };
              }
              return launch(enq, actions, { ...context, ledger, pending: undefined });
            }),
            appendRefused: refines('logFenced', ({ context, event }) =>
              event.key === context.pending
                ? { target: '#closing', context: { ...context, pending: undefined, cause: 'fenced' } }
                : {},
            ),
          },
        },
      },
    },
    running: {
      /* Entered only by `#id` targets; alpha.59 requires the initial anyway. */
      initial: 'tau',
      tags: ['slotHeld'],
      on: {
        agentEnded: refines('agentEnded', ({ context, event, actions }, enq) => {
          if (!sameAttempt(context.slot, event.key)) {
            return {};
          }
          return record(enq, actions, {
            ...context,
            slot: {
              ...context.slot,
              ending: {
                ...(context.slot.ending ?? { reason: 'ended' }),
                outcome: event.outcome,
                ...(event.failure === undefined ? {} : { failure: event.failure }),
                ...(event.stopReason === undefined ? {} : { stopReason: event.stopReason }),
              },
            },
          });
        }),
        cancel: refines('cancel', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          if (event.payload.runId !== context.slot.key.runId) {
            enq(actions.answer, { answer: liveRefusal(context, event.commandId) });
            return {};
          }
          enq(actions.abortDriver, { key: context.slot.key, reason: 'cancel' });
          for (const interruptId of Object.keys(context.ledger.runs[context.slot.key.runId]?.pendingInterrupts ?? {})) {
            enq(actions.decideApproval, { key: context.slot.key, resolution: { interruptId, outcome: 'cancelled' } });
          }
          return {
            target: '#stopping',
            context: {
              ...context,
              slot: { ...context.slot, ending: { reason: 'cancel', commandId: event.commandId } },
            },
          };
        }),
        resume: refines('resume', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : event.payload.runId === context.slot.key.runId
                ? nothingToDo(context.ledger, event.commandId, { state: 'running', runId: event.payload.runId })
                : refused(context.ledger, event.commandId, {
                    code: 'RESUME_UNAVAILABLE',
                    message: `Run ${event.payload.runId} is not this chat's current run.`,
                  }),
          });
          return {};
        }),
        rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
          const ledger = newer(context.ledger, event.ledger);
          const delivered = context.slot.steers.filter((commandId) => event.messageIds.includes(`steer:${commandId}`));
          for (const commandId of delivered) {
            enq(actions.answer, { answer: durable(ledger, commandId) });
          }
          if (event.key !== undefined && event.key === context.pending) {
            return settleDecision(enq, actions, { ...context, ledger, pending: undefined });
          }
          return {
            context: {
              ...context,
              ledger,
              slot: {
                ...context.slot,
                steers: context.slot.steers.filter((commandId) => !delivered.includes(commandId)),
              },
            },
          };
        }),
        appendRefused: refines('logFenced', ({ context, event, actions }, enq) => {
          if (event.key !== context.pending) {
            return {};
          }
          if (context.slot.decision !== undefined) {
            enq(actions.answer, { answer: refused(context.ledger, context.slot.decision.commandId, event) });
          }
          enq(actions.abortDriver, { key: context.slot.key, reason: 'relinquish' });
          /* The fence loses the lease too (TS-R15). */
          if (context.placement) {
            enq(actions.abandonPlacement, { key: context.slot.key });
          }
          return { target: '#closing', context: { ...context, pending: undefined, cause: 'fenced' } };
        }),
        close: refines('close', ({ context, actions }, enq) => {
          enq(actions.abortDriver, { key: context.slot.key, reason: 'close' });
          return {
            target: '#stopping',
            context: {
              ...context,
              cause: context.cause ?? 'close',
              slot: { ...context.slot, ending: { reason: 'close' } },
            },
          };
        }),
        relinquish: refines('relinquish', ({ context, actions }, enq) => {
          enq(actions.abortDriver, { key: context.slot.key, reason: 'relinquish' });
          if (context.placement) {
            enq(actions.abandonPlacement, { key: context.slot.key });
          }
          return { target: '#closing', context: { ...context, cause: 'relinquish' } };
        }),
      },
      states: {
        tau: {
          on: {
            steer: refines('steer', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              if (event.payload.runId !== context.slot.key.runId) {
                enq(actions.answer, { answer: notLive(context, event.commandId, event.payload.runId) });
                return {};
              }
              enq(actions.steerDriver, {
                key: context.slot.key,
                commandId: event.commandId,
                message: event.payload.message,
              });
              return {
                context: { ...context, slot: { ...context.slot, steers: [...context.slot.steers, event.commandId] } },
              };
            }),
            interrupt: refines('interrupt', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              if (event.payload.runId !== context.slot.key.runId) {
                enq(actions.answer, { answer: notLive(context, event.commandId, event.payload.runId) });
                return {};
              }
              enq(actions.abortDriver, { key: context.slot.key, reason: 'interrupt' });
              const { interruptId, kind, prompt, payload } = event.payload;
              return {
                target: '#stopping',
                context: {
                  ...context,
                  slot: {
                    ...context.slot,
                    ending: {
                      reason: 'interrupt',
                      commandId: event.commandId,
                      interrupt: { interruptId, kind, prompt, ...(payload === undefined ? {} : { payload }) },
                    },
                  },
                },
              };
            }),
          },
        },
        external: {
          on: {
            steer: refines('steer', ({ context, event, actions }, enq) =>
              externalUnsupported(enq, actions, { context, commandId: event.commandId }),
            ),
            interrupt: refines('interrupt', ({ context, event, actions }, enq) =>
              externalUnsupported(enq, actions, { context, commandId: event.commandId }),
            ),
            approvalRequested: refines('approvalRequested', ({ context, event, actions }, enq) => {
              if (!sameAttempt(context.slot, event.key)) {
                return {};
              }
              return request(enq, actions, { context, interruptId: event.interruptId, request: event.request });
            }),
          },
        },
        /* An external agent waits on a person; its driver stays live (D10 is about native pauses). */
        awaitingDecision: {
          on: {
            steer: refines('steer', ({ context, event, actions }, enq) =>
              externalUnsupported(enq, actions, { context, commandId: event.commandId }),
            ),
            interrupt: refines('interrupt', ({ context, event, actions }, enq) =>
              externalUnsupported(enq, actions, { context, commandId: event.commandId }),
            ),
            approvalRequested: refines('approvalRequested', ({ context, event, actions }, enq) => {
              if (!sameAttempt(context.slot, event.key)) {
                return {};
              }
              return request(enq, actions, { context, interruptId: event.interruptId, request: event.request });
            }),
            'resolve-interrupt': refines('resolveInterrupt', ({ context, event, actions }, enq) => {
              if (context.ledger.applied[event.commandId]) {
                enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
                return {};
              }
              const { runId, interruptId } = event.payload;
              if (
                runId !== context.slot.key.runId ||
                context.ledger.runs[runId]?.pendingInterrupts[interruptId] === undefined ||
                context.slot.decision !== undefined ||
                context.pending !== undefined
              ) {
                enq(actions.answer, {
                  answer:
                    context.slot.decision !== undefined || context.pending !== undefined
                      ? liveRefusal(context, event.commandId, 'paused')
                      : notPending(context, event.commandId, event.payload),
                });
                return {};
              }
              const resolution: ApprovalResolution = {
                interruptId,
                outcome: event.payload.outcome,
                ...(event.payload.optionId === undefined ? {} : { optionId: event.payload.optionId }),
                ...(event.payload.payload === undefined ? {} : { payload: event.payload.payload }),
              };
              const next = minted(context, 'resolve');
              const stillPending = Object.keys(context.ledger.runs[runId].pendingInterrupts).filter(
                (id) => id !== interruptId,
              );
              enq(actions.appendRows, {
                key: next.key,
                rows: [resolvedRow(resolution), ...(stillPending.length === 0 ? [lifecycle('running')] : [])].map(
                  (body) => ({
                    runId,
                    body,
                    commandId: event.commandId,
                  }),
                ),
              });
              return {
                context: {
                  ...context,
                  seq: next.seq,
                  pending: next.key,
                  slot: { ...context.slot, decision: { commandId: event.commandId, resolution } },
                },
              };
            }),
          },
        },
      },
    },
    ending: {
      /* Entered only by `#id` targets; alpha.59 requires the initial anyway. */
      initial: 'stopping',
      tags: ['slotHeld'],
      on: {
        /* The totality matrix's `Q`: applied to what the ending leaves. */
        cancel: refines('cancel', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        resume: refines('resume', ({ context, event, actions }, enq) => {
          if (context.ledger.applied[event.commandId]) {
            enq(actions.answer, { answer: durable(context.ledger, event.commandId, 'replayed') });
            return {};
          }
          return { context: { ...context, slot: { ...context.slot, held: [...context.slot.held, held(event)] } } };
        }),
        close: refines('close', ({ context }) => ({ context: { ...context, cause: context.cause ?? 'close' } })),
        relinquish: refines('relinquish', ({ context, actions }, enq) => {
          enq(actions.abortDriver, { key: context.slot.key, reason: 'relinquish' });
          if (context.placement) {
            enq(actions.abandonPlacement, { key: context.slot.key });
          }
          return { target: '#closing', context: { ...context, cause: 'relinquish' } };
        }),
      },
      states: {
        stopping: {
          /* E15: a tau driver that has not stopped loses its tool port before the ending row (D13, TS-R15).
           * `ChatRunSlot.tla` models only a cancel with placement; the other branches are `Unmodelled`, and the
           * no-placement branch writes its ending row with no fence until W8 (W8 closes D13 for the no-placement
           * stop bound). */
          after: {
            driverStopBound: branches(
              refines('Unmodelled', ({ context, actions }, enq) => {
                if (context.slot.kind !== 'tau') {
                  /* M3's close ladder bounds an external stop; the timer is answered (MC-R16). */
                  return {};
                }
                if (context.placement && context.slot.ending?.reason === 'cancel') {
                  return undefined;
                }
                if (context.placement) {
                  enq(actions.abandonPlacement, { key: context.slot.key });
                  return { target: '#fencing', context: stoppedAt(context) };
                }
                return record(enq, actions, stoppedAt(context));
              }),
              refines('abandon', ({ context, actions }, enq) => {
                enq(actions.abandonPlacement, { key: context.slot.key });
                return { target: '#fencing', context: stoppedAt(context) };
              }),
            ),
          },
          on: {
            agentEnded: refines('agentEnded', ({ context, event, actions }, enq) => {
              if (!sameAttempt(context.slot, event.key)) {
                return {};
              }
              return record(enq, actions, {
                ...context,
                slot: {
                  ...context.slot,
                  ending: {
                    ...(context.slot.ending ?? { reason: 'ended' }),
                    outcome: event.outcome,
                    ...(event.failure === undefined ? {} : { failure: event.failure }),
                    ...(event.stopReason === undefined ? {} : { stopReason: event.stopReason }),
                  },
                },
              });
            }),
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              /* A steer the stopping driver still wrote is answered once durable, as while running (I18). */
              const delivered = context.slot.steers.filter((commandId) =>
                event.messageIds.includes(`steer:${commandId}`),
              );
              for (const commandId of delivered) {
                enq(actions.answer, { answer: durable(ledger, commandId) });
              }
              const slot = decisionAnswered(enq, actions, { ...context, ledger });
              return {
                context: {
                  ...context,
                  ledger,
                  ...(event.key !== undefined && event.key === context.pending ? { pending: undefined } : {}),
                  slot: { ...slot, steers: slot.steers.filter((commandId) => !delivered.includes(commandId)) },
                },
              };
            }),
          },
        },
        fencing: {
          on: {
            abandoned: branches(
              /* An abandon whose effect is unknown: the tool port may still write, so no ending row (closing). */
              refines('Unmodelled', ({ context, event }) =>
                sameAttempt(context.slot, event.key) && event.unknown === true
                  ? { target: '#closing', context: { ...context, cause: context.cause ?? 'fenced' } }
                  : undefined,
              ),
              refines('abandoned', ({ context, event, actions }, enq) =>
                sameAttempt(context.slot, event.key) ? record(enq, actions, context) : {},
              ),
            ),
          },
        },
        /* The ending batch, with `executed`; the driver's gate closes before it (RA-R6). */
        recording: {
          on: {
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              if (event.key !== context.pending) {
                return { context: { ...context, ledger } };
              }
              const { ending } = context.slot;
              if (ending?.commandId !== undefined) {
                enq(actions.answer, {
                  answer: ledger.applied[ending.commandId]
                    ? durable(ledger, ending.commandId)
                    : notLive({ ...context, ledger }, ending.commandId, context.slot.key.runId),
                });
              }
              /* A steer or a resolution whose row is durable was applied, whatever ended the run (W7.r1 P1, P2). */
              for (const commandId of context.slot.steers) {
                enq(actions.answer, {
                  answer: ledger.applied[commandId]
                    ? durable(ledger, commandId)
                    : refused(ledger, commandId, {
                        code: 'STEER_NOT_DELIVERED',
                        message: 'The run ended before this message reached it; send it as a new turn.',
                      }),
                });
              }
              decisionAnsweredOrRefused(enq, actions, { ...context, ledger });
              if (context.slot.held.length > 0) {
                enq(actions.redeliver, { commands: context.slot.held });
              }
              return {
                target: '#idle',
                context: { ...context, ledger, pending: undefined },
              };
            }),
            appendRefused: refines('logFenced', ({ context, event, actions }, enq) => {
              if (event.key !== context.pending) {
                return {};
              }
              const { ending } = context.slot;
              if (ending?.commandId !== undefined) {
                enq(actions.answer, { answer: refused(context.ledger, ending.commandId, event) });
              }
              if (context.placement) {
                enq(actions.abandonPlacement, { key: context.slot.key });
              }
              return { target: '#closing', context: { ...context, pending: undefined, cause: 'fenced' } };
            }),
          },
        },
      },
    },
    /* Every attempt that ends is placed, cut if it executed, settled and acknowledged before the next (RA-R12). */
    settling: {
      /* Entered only by `#id` targets; alpha.59 requires the initial anyway. */
      initial: 'finishing',
      tags: ['slotHeld'],
      on: {
        close: refines('close', ({ context }) => ({ context: { ...context, cause: context.cause ?? 'close' } })),
        /* The totality matrix: a command waits for the attempt to settle, `CHAT_RUN_LIVE{settling}` (retry class
         * `wait`), which the page re-sends until it is admitted (W8.r1 item 6). */
        start: refines('start', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : liveRefusal(context, event.commandId, 'settling'),
          });
          return {};
        }),
        resume: refines('resume', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : liveRefusal(context, event.commandId, 'settling'),
          });
          return {};
        }),
        cancel: refines('cancel', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : liveRefusal(context, event.commandId, 'settling'),
          });
          return {};
        }),
        'resolve-interrupt': refines('resolveInterrupt', ({ context, event, actions }, enq) => {
          enq(actions.answer, {
            answer: context.ledger.applied[event.commandId]
              ? durable(context.ledger, event.commandId, 'replayed')
              : liveRefusal(context, event.commandId, 'settling'),
          });
          return {};
        }),
      },
      states: {
        finishing: {
          entry: ({ context, actions }, enq) => {
            enq(actions.completePlacement, { key: context.settle.key, cut: context.settle.cut });
          },
          on: {
            completeAnswered: branches(
              /* Refused or unknown: the spec's `complete` is only the applied answer. */
              refines('Unmodelled', ({ context, event }) => {
                if (!keysMatch(context.settle.key, event.key) || event.status === 'applied') {
                  return undefined;
                }
                if (event.code === 'CUT_FAILED') {
                  return { target: '#backingOff' };
                }
                if (event.code === 'TURN_UNKNOWN') {
                  /* No lease, so no revision (TS-R13). */
                  return {
                    target: '#appending',
                    context: {
                      ...context,
                      settle: {
                        ...context.settle,
                        answered: true,
                        row: {
                          type: 'turn.failed',
                          chatId: context.chatId,
                          turnId: context.settle.key.turnId,
                          runId: context.settle.key.runId,
                          attempt: context.settle.key.attempt,
                          reason: 'The attempt ended with no lease to settle.',
                          code: 'RUN_ABANDONED',
                        },
                      },
                    },
                  };
                }
                return { target: '#closing', context: { ...context, cause: context.cause ?? 'fenced' } };
              }),
              refines('complete', ({ context, event }) => {
                if (!keysMatch(context.settle.key, event.key)) {
                  return {};
                }
                const settle = { ...context.settle, answered: true };
                return settle.row === undefined
                  ? { context: { ...context, settle } }
                  : { target: '#appending', context: { ...context, settle } };
              }),
            ),
            settlementPublished: refines('settlementPublished', ({ context, event }) => {
              if (!keysMatch(context.settle.key, event.key)) {
                return {};
              }
              const settle = { ...context.settle, row: event.row };
              return settle.answered
                ? { target: '#appending', context: { ...context, settle } }
                : { context: { ...context, settle } };
            }),
          },
        },
        backingOff: {
          after: { cutRetry: { target: '#finishing', reenter: true, meta: { tla: 'Unmodelled' } } },
          on: {
            settlementPublished: refines('settlementPublished', ({ context, event }) =>
              keysMatch(context.settle.key, event.key)
                ? { context: { ...context, settle: { ...context.settle, row: event.row } } }
                : {},
            ),
          },
        },
        /* The `turn.*` row, only if the ledger has none for the attempt (TS-R18). */
        appending: {
          entry: ({ context, actions }, enq) => {
            const { row, key } = context.settle;
            if (row === undefined || settlementOf(context.ledger, key)) {
              enq(actions.acknowledgePlacement, { key });
              return;
            }
            /* The row keeps the attempt it settles (N4); the write gate requires it (TS-S9). */
            const { runId, ...body } = row;
            enq(actions.appendRows, {
              key: `settle:${runId}:${String(key.attempt)}`,
              rows: [{ runId, body: body as LogRowBody }],
            });
          },
          on: {
            rowsCommitted: refines('rowsCommitted', ({ context, event, actions }, enq) => {
              const ledger = newer(context.ledger, event.ledger);
              if (event.key !== `settle:${context.settle.key.runId}:${String(context.settle.key.attempt)}`) {
                return { context: { ...context, ledger } };
              }
              enq(actions.acknowledgePlacement, { key: context.settle.key });
              return { target: '#retiring', context: { ...context, ledger } };
            }),
            appendRefused: branches(
              /* Counts as durable; reported (TS-R18). Not the spec's `logFenced`. */
              refines('Unmodelled', ({ context, event, actions }, enq) => {
                if (!isSettleKey(context, event.key) || event.code !== 'SETTLEMENT_CONFLICT') {
                  return undefined;
                }
                enq(actions.acknowledgePlacement, { key: context.settle.key });
                return { target: '#retiring' };
              }),
              /* `_enq` types the unmodelled branch's effects (`branches` reads its parameters from this one). */
              refines('logFenced', ({ context, event }, _enq) =>
                isSettleKey(context, event.key) ? { target: '#closing', context: { ...context, cause: 'fenced' } } : {},
              ),
            ),
            acknowledged: branches(
              /* An acknowledge whose effect is unknown: the incarnation closes (effect unknown -> closing). */
              refines('Unmodelled', ({ context, event }) =>
                keysMatch(context.settle.key, event.key) && event.unknown === true
                  ? { target: '#closing', context: { ...context, cause: context.cause ?? 'fenced' } }
                  : undefined,
              ),
              refines('acknowledge', ({ context, event }) =>
                keysMatch(context.settle.key, event.key) ? { target: '#idle' } : {},
              ),
            ),
          },
        },
        retiring: {
          on: {
            acknowledged: branches(
              /* An acknowledge whose effect is unknown: the incarnation closes (effect unknown -> closing). */
              refines('Unmodelled', ({ context, event }) =>
                keysMatch(context.settle.key, event.key) && event.unknown === true
                  ? { target: '#closing', context: { ...context, cause: context.cause ?? 'fenced' } }
                  : undefined,
              ),
              refines('acknowledge', ({ context, event }) =>
                keysMatch(context.settle.key, event.key) ? { target: '#idle' } : {},
              ),
            ),
          },
        },
      },
    },
    /* Stop serving; the chat's writer closes. `cause` names why (W6 reads it from the output). */
    closing: {
      tags: ['refusingWrites'],
      entry: ({ context, actions }, enq) => {
        enq(actions.closeLog, { chatId: context.chatId });
      },
      on: {
        logClosed: { target: '#closed', meta: { tla: 'logClosed' } },
        close: refines('close', () => ({})),
        relinquish: refines('relinquish', ({ context }) => ({ context: { ...context, cause: 'relinquish' } })),
      },
    },
    closed: {
      type: 'final',
      tags: ['refusingWrites'],
    },
  },
});
