/**
 * The chat ledger: the one fold of a chat log's durable facts (D3, W3 §4).
 *
 * Pure, total and JSON-safe, with no XState import (CL-R18): M1, the host, the CLI and the page call the reducer
 * directly, and an actor that consumes it wraps it in its own `createLogic`. Every optional field is absent, never
 * `undefined`, so a ledger survives `JSON.parse(JSON.stringify(ledger))` unchanged and its canonical form is what the
 * Lean oracle and the traces exchange.
 */
import { canonicalJson } from '#log/canonical-json.js';
import { classifyLogRow, historyRowTypes } from '#log/event-schema.js';
import type { ClassifiedRow } from '#log/event-schema.js';
import { projectionBatchSchema } from '#log/projection-facts.js';
import type {
  KnownProjectionEvent,
  ProjectionBatch,
  ProjectionFact,
  ProjectionSourceHealth,
} from '#log/projection-facts.js';
import type { ReadRow } from '#log/serialization.js';
import { isResumableRun } from '#log/resumable.js';
import lifecycleTable from '#log/run-lifecycle.legality.json' with { type: 'json' };
import operationTable from '#log/run-operation.legality.json' with { type: 'json' };
import settlementTable from '#log/run-settlement.legality.json' with { type: 'json' };
import type {
  AgentLogEvent,
  JsonValue,
  LogEventBase,
  ProviderMessage,
  RunFailureDetail,
  RunLifecycleEvent,
  RunLifecycleState,
  RowKey,
  TurnConflictedLogEvent,
  TurnFailedLogEvent,
  TurnFinalizedLogEvent,
  TurnPlacement,
} from '#log/event-types.js';

/** A row before its envelope is stamped. @internal */
export type LogRowBody = AgentLogEvent extends infer Event
  ? Event extends LogEventBase
    ? Omit<Event, Exclude<keyof LogEventBase, 'attempt'>>
    : never
  : never;

/** Where a reader is: rows folded and the last one's key; exactly what a read sends. @public */
export type LedgerPosition = Readonly<{ cursor: number; last?: RowKey; sourceGeneration?: string }>;

/** A run's coded failure, as its terminal row states it. @internal */
export type LedgerRunFailure = Readonly<RunFailureDetail & { code: string }>;

/** An interrupt's recorded resolution. @internal */
export type LedgerInterruptResolution = Readonly<{
  interruptId: string;
  outcome: 'approved' | 'denied' | 'cancelled';
  optionId?: string;
  payload?: JsonValue;
}>;

/** One of the three rows that settle a turn attempt (D10). @internal */
export type TurnSettlementEvent = TurnFinalizedLogEvent | TurnConflictedLogEvent | TurnFailedLogEvent;

/** @public */
export type RunEntry = Readonly<{
  kind: 'tau' | 'external';
  /** The run's user-message id; absent only when a legacy log cannot name it. */
  turnId?: string;
  /** 1 at `admitted`; explicit afterwards. */
  attempt: number;
  lifecycle?: RunLifecycleState;
  /** The current attempt's append state. */
  appendState: 'unadmitted' | 'open' | 'terminal' | 'settled';
  /** The run's user turn is durable. */
  committed: boolean;
  /** The external prompt was issued for this run before its intentional Stop. */
  externalPrompted?: boolean;
  failure?: LedgerRunFailure;
  /** Attempt 1's placement of record (D9). */
  placement?: TurnPlacement;
  /** First versioned mutation proof by attempt, replayed from `turn.changed`. */
  changes?: Readonly<Record<number, Readonly<{ checkoutId: string }>>>;
  /** One settlement per attempt (I9). */
  settlements: ReadonlyArray<Readonly<{ attempt: number; row: RowKey; event: TurnSettlementEvent }>>;
  /** Each unresolved interrupt's id → the row that requested it. */
  pendingInterrupts: Readonly<Record<string, RowKey>>;
  /** Interrupt ids with a recorded resolution, including unrecognized outcomes. */
  resolvedInterrupts?: readonly string[];
  lastResolution?: LedgerInterruptResolution;
  /** The run's last prepared model attempt id, until a shown reply or a settled row closes it. */
  openInvocation?: string;
  /** A newer build's row belongs to this run: commands on it are refused `RUN_UNREADABLE`. */
  opaque: boolean;
}>;

/** @public */
export type InvocationEntry = Readonly<{
  runId: string;
  attempt: number;
  purpose: 'generation' | 'compaction';
  prepared: RowKey;
  /** The account that funded it, when its prepared row names one (RV5-F2). */
  principal?: string;
  /** The bound operation: a snapshot at bind, never read as current status (GI-R6). */
  operationId?: string;
  /** `'0'` credit atoms for a voided or released attempt. */
  settled?: Readonly<{
    outcome: 'settled' | 'released' | 'absorbed' | 'voided';
    chargedCreditAtoms: string;
    row: RowKey;
  }>;
  /** A reply was shown: a non-failure assistant message, or the compaction it served (GI-R5). */
  shown: boolean;
}>;

/** A row the fold kept but could not use. @public */
export type LedgerAnomaly = Readonly<{ kind: 'opaque' | 'quarantined' | 'order' | 'conflict'; row?: RowKey }>;

/** @public */
export type ChatLedger = Readonly<{
  position: LedgerPosition;
  /** Per term (by `leaderEpoch`): its integer epoch, if it has one, and its last folded sequence. */
  terms: Readonly<Record<string, Readonly<{ epoch?: number; lastSequence: number }>>>;
  /** 0 while every term is legacy. */
  maxEpoch: number;
  /** The chat's current run: the run of its last lifecycle row. `runs[currentRunId]` holds its facts. */
  currentRunId?: string;
  runs: Readonly<Record<string, RunEntry>>;
  /** Each command id → its first row's cursor, run and attempt (D15). */
  applied: Readonly<Record<string, Readonly<{ cursor: number; runId?: string; attempt?: number }>>>;
  /** Model attemptId → its facts (W11). */
  invocations: Readonly<Record<string, InvocationEntry>>;
  lastTerminal?: Readonly<{
    runId: string;
    outcome: 'completed' | 'failed' | 'cancelled';
    failure?: LedgerRunFailure;
    row: RowKey;
  }>;
  /** `false` once a history row cannot be interpreted: the chat reads, and the host refuses to run it. */
  historyIntact: boolean;
  /** `true` once a newer build's history row is folded (D16): the host answers `RUN_UNREADABLE`, in any run. */
  newerHistory: boolean;
  anomalies: readonly LedgerAnomaly[];
}>;

/** A frozen value, not a factory: the ledger is immutable. @public */
export const emptyChatLedger: ChatLedger = Object.freeze({
  position: Object.freeze({ cursor: 0 }),
  terms: Object.freeze({}),
  maxEpoch: 0,
  runs: Object.freeze({}),
  applied: Object.freeze({}),
  invocations: Object.freeze({}),
  historyIntact: true,
  newerHistory: false,
  anomalies: Object.freeze([]),
});

const settlementTypes: ReadonlySet<string> = new Set(['turn.finalized', 'turn.conflicted', 'turn.failed']);
const envelopeKeys: ReadonlySet<string> = new Set([
  'version',
  'leaderEpoch',
  'sequence',
  'recordedAt',
  'runId',
  'epoch',
  'commandId',
  'attempt',
]);
const endedStates: ReadonlySet<RunLifecycleState> = new Set(['completed', 'failed', 'cancelled']);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type EntryDraft = Omit<Mutable<RunEntry>, 'settlements' | 'pendingInterrupts' | 'resolvedInterrupts'> & {
  settlements: Array<RunEntry['settlements'][number]>;
  pendingInterrupts: Record<string, RowKey>;
  resolvedInterrupts: string[];
};
type Draft = {
  -readonly [K in keyof ChatLedger]: K extends 'terms' | 'runs' | 'applied' | 'invocations'
    ? Record<string, ChatLedger[K][string]>
    : K extends 'anomalies'
      ? LedgerAnomaly[]
      : ChatLedger[K];
};

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The attempt the row states; absent on a legacy row, whose attempt its position implies. */
const statedAttempt = (event: Pick<LogEventBase, 'attempt'>): number | undefined => event.attempt;

const keyOf = (event: Pick<LogEventBase, 'leaderEpoch' | 'sequence'>): RowKey => ({
  leaderEpoch: event.leaderEpoch,
  sequence: event.sequence,
});

const internalKind = (message: ProviderMessage): string | undefined => {
  const kind = message.metadata?.tauInternal?.['kind'];
  return typeof kind === 'string' ? kind : undefined;
};

const stubEntry = (): RunEntry => ({
  kind: 'tau',
  attempt: 1,
  appendState: 'unadmitted',
  committed: false,
  settlements: [],
  pendingInterrupts: {},
  resolvedInterrupts: [],
  opaque: false,
});

/** The run's current attempt has ended: a terminal row, or a native pause, which ends its attempt (CL-R9). */
const attemptEnded = (entry: RunEntry): boolean =>
  entry.lifecycle !== undefined &&
  (endedStates.has(entry.lifecycle) || (entry.lifecycle === 'paused' && entry.kind === 'tau'));

/** The lifecycle half of the reopen predicate: a resumable failure, or a native pause with no pending request. */
const reopenable = (entry: RunEntry): boolean =>
  attemptEnded(entry) &&
  (isResumableRun(entry) || (entry.lifecycle === 'paused' && Object.keys(entry.pendingInterrupts).length === 0));

/**
 * The one reopen predicate (I10, CL-R9): the fold, the gate and resume all call it. A `running` row opens the next
 * attempt only when it names that attempt (or, legacy, none), and the run's current attempt ended with a resumable
 * failure or a native pause with no pending request. Settled or not: without placement no attempt is ever settled,
 * and the spec opens `Att(T)+1` on every reopening row (`ChatRunSlot.tla` resume; W7.r1 finding 1). Placement still
 * settles before it reopens, which M1 orders (D17).
 *
 * @internal
 * @param entry - The run before the row.
 * @param row - The lifecycle row.
 * @returns `true` when the row opens attempt `entry.attempt + 1`.
 */
export const reopens = (entry: RunEntry, row: Pick<RunLifecycleEvent, 'state' | 'attempt'>): boolean =>
  row.state === 'running' && (row.attempt === undefined || row.attempt === entry.attempt + 1) && reopenable(entry);

/** The run's condition, in `run-lifecycle.legality.json`'s domain. */
const lifecycleCondition = (entry: RunEntry | undefined): keyof typeof lifecycleTable.table => {
  if (entry?.lifecycle === undefined) {
    return 'unadmitted';
  }
  if (entry.appendState !== 'settled') {
    return attemptEnded(entry) ? 'ended' : 'open';
  }
  if (!attemptEnded(entry)) {
    return 'settled-open';
  }
  if (!reopenable(entry)) {
    return 'settled';
  }
  /* A settled native pause with nothing pending reopens on `running`, or is cancelled: a denial's or a cancel's
   * `cancelled` row ends the paused attempt without reopening it (V8, RA's cancel after a restart). `reopenable` is a
   * settled resumable failure only, which a `cancelled` row cannot follow. */
  return entry.lifecycle === 'paused' ? 'paused-reopenable' : 'reopenable';
};

/** The chat's run state, in `run-operation.legality.json`'s domain; `reserved` is memory-only (D3). @internal */
export type ChatRunState = keyof typeof operationTable.table;

/**
 * The chat's durable run state: its current run's lifecycle, or `terminal` once it ended.
 *
 * @internal
 */
export const chatRunState = (ledger: ChatLedger): Exclude<ChatRunState, 'reserved'> => {
  const lifecycle = ledger.currentRunId === undefined ? undefined : ledger.runs[ledger.currentRunId]?.lifecycle;
  if (lifecycle === undefined) {
    return 'none';
  }
  return endedStates.has(lifecycle) ? 'terminal' : (lifecycle as 'admitted' | 'running' | 'paused');
};

const settlementBody = (event: AgentLogEvent): string =>
  canonicalJson(Object.fromEntries(Object.entries(event).filter(([key]) => !envelopeKeys.has(key))));

const resolutionOf = (interruptId: string, payload: JsonValue | undefined): LedgerInterruptResolution | undefined => {
  if (!isObject(payload)) {
    return undefined;
  }
  const { outcome, optionId } = payload;
  if (outcome !== 'approved' && outcome !== 'denied' && outcome !== 'cancelled') {
    return undefined;
  }
  return {
    interruptId,
    outcome,
    ...(typeof optionId === 'string' ? { optionId } : {}),
    ...(payload['response'] === undefined ? {} : { payload: payload['response'] }),
  };
};

/** One fold over a mutable draft: copy-on-write per run, one copy of each record per call. */
const createFold = (ledger: ChatLedger) => {
  const draft: Draft = {
    ...ledger,
    terms: { ...ledger.terms },
    runs: { ...ledger.runs },
    applied: { ...ledger.applied },
    invocations: { ...ledger.invocations },
    anomalies: [...ledger.anomalies],
  };
  const touched = new Set<string>();
  const entryOf = (runId: string): EntryDraft => {
    const current = draft.runs[runId];
    if (current && touched.has(runId)) {
      return current as EntryDraft;
    }
    const base = current ?? stubEntry();
    const copy: EntryDraft = {
      ...base,
      settlements: [...base.settlements],
      pendingInterrupts: { ...base.pendingInterrupts },
      resolvedInterrupts: [...(base.resolvedInterrupts ?? [])],
    };
    draft.runs[runId] = copy;
    touched.add(runId);
    return copy;
  };
  const drop = <Key extends keyof EntryDraft>(entry: EntryDraft, key: Key): void => {
    Reflect.deleteProperty(entry, key);
  };

  const markShown = (attemptId: string): void => {
    const invocation = draft.invocations[attemptId];
    if (invocation === undefined || invocation.shown) {
      return;
    }
    draft.invocations[attemptId] = { ...invocation, shown: true };
    const entry = draft.runs[invocation.runId];
    if (entry?.openInvocation === attemptId) {
      drop(entryOf(invocation.runId), 'openInvocation');
    }
  };

  const noteTurn = (entry: EntryDraft, message: ProviderMessage, runId: string): void => {
    if (message.role !== 'user') {
      return;
    }
    const kind = internalKind(message);
    if (kind === 'external-agent') {
      entry.kind = 'external';
      entry.committed = true;
      const prompted = message.metadata?.tauInternal?.['acpPromptedRequestId'];
      entry.externalPrompted = typeof prompted === 'string' && prompted.startsWith(`${runId}:`);
    }
    if (entry.turnId === undefined && kind !== 'interrupt-recovery') {
      entry.turnId = message.id;
    }
  };

  const lifecycle = (event: RunLifecycleEvent, key: RowKey): void => {
    const entry = entryOf(event.runId);
    draft.currentRunId = event.runId;
    if (event.state === 'admitted') {
      if (entry.lifecycle !== undefined) {
        draft.anomalies.push({ kind: 'order', row: key });
        return;
      }
      entry.attempt = 1;
      entry.lifecycle = 'admitted';
      entry.appendState = entry.settlements.some((settlement) => settlement.attempt === 1) ? 'settled' : 'open';
      return;
    }
    if (entry.lifecycle === undefined) {
      draft.anomalies.push({ kind: 'order', row: key });
      entry.attempt = statedAttempt(event) ?? 1;
    } else if (reopens(entry, event)) {
      entry.attempt += 1;
    } else if (statedAttempt(event) !== undefined && statedAttempt(event) !== entry.attempt) {
      draft.anomalies.push({ kind: 'order', row: key });
    }
    entry.lifecycle = event.state;
    if (event.state !== 'failed' && event.state !== 'cancelled') {
      drop(entry, 'failure');
    } else if (event.detail?.code === undefined) {
      drop(entry, 'failure');
    } else {
      entry.failure = { ...event.detail, code: event.detail.code };
    }
    if (event.state === 'running' && event.placement !== undefined && entry.attempt === 1) {
      entry.placement ??= event.placement;
    }
    const settled = entry.settlements.some((settlement) => settlement.attempt === entry.attempt);
    entry.appendState = settled ? 'settled' : attemptEnded(entry) ? 'terminal' : 'open';
    if (endedStates.has(event.state)) {
      draft.lastTerminal = {
        runId: event.runId,
        outcome: event.state as 'completed' | 'failed' | 'cancelled',
        ...(entry.failure ? { failure: entry.failure } : {}),
        row: key,
      };
    }
  };

  const settlement = (event: TurnSettlementEvent, key: RowKey): void => {
    const entry = entryOf(event.runId);
    const attempt = statedAttempt(event) ?? entry.attempt;
    const prior = entry.settlements.find((recorded) => recorded.attempt === attempt);
    if (prior !== undefined) {
      if (settlementBody(prior.event) !== settlementBody(event)) {
        draft.anomalies.push({ kind: 'conflict', row: key });
      }
      return;
    }
    entry.settlements.push({ attempt, row: key, event });
    if (attempt === entry.attempt && entry.lifecycle !== undefined) {
      entry.appendState = 'settled';
    }
  };

  const invocationsOfRun = (runId: string, purpose: InvocationEntry['purpose']): string[] =>
    Object.entries(draft.invocations).flatMap(([attemptId, invocation]) =>
      invocation.runId === runId && invocation.purpose === purpose ? [attemptId] : [],
    );

  const known = (event: AgentLogEvent | KnownProjectionEvent, key: RowKey): void => {
    switch (event.type) {
      case 'run.lifecycle': {
        lifecycle(event, key);
        return;
      }
      case 'turn.changed': {
        const entry = entryOf(event.runId);
        if (entry.turnId === event.turnId && event.attempt <= entry.attempt) {
          entry.changes = { ...entry.changes, [event.attempt]: { checkoutId: event.checkoutId } };
        }
        return;
      }
      case 'turn.finalized':
      case 'turn.conflicted':
      case 'turn.failed': {
        settlement(event, key);
        return;
      }
      case 'interrupt.recorded': {
        const entry = entryOf(event.runId);
        if (event.phase === 'requested') {
          entry.pendingInterrupts[event.interruptId] = key;
          return;
        }
        Reflect.deleteProperty(entry.pendingInterrupts, event.interruptId);
        if (!entry.resolvedInterrupts.includes(event.interruptId)) {
          entry.resolvedInterrupts.push(event.interruptId);
        }
        const resolution = resolutionOf(event.interruptId, event.payload);
        if (resolution) {
          entry.lastResolution = resolution;
        }
        return;
      }
      case 'model.invocation-prepared': {
        if (draft.invocations[event.attemptId] !== undefined) {
          draft.anomalies.push({ kind: 'conflict', row: key });
          return;
        }
        const entry = entryOf(event.runId);
        draft.invocations[event.attemptId] = {
          runId: event.runId,
          attempt: entry.attempt,
          purpose: event.purpose,
          prepared: key,
          ...(event.principal === undefined ? {} : { principal: event.principal }),
          shown: false,
        };
        entry.openInvocation = event.attemptId;
        return;
      }
      case 'model.invocation-bound': {
        const invocation = draft.invocations[event.attemptId];
        if (invocation !== undefined && invocation.operationId === undefined) {
          draft.invocations[event.attemptId] = { ...invocation, operationId: event.operationId };
        }
        return;
      }
      case 'model.invocation-settled': {
        const invocation = draft.invocations[event.attemptId];
        if (invocation === undefined || invocation.settled !== undefined) {
          draft.anomalies.push({ kind: 'conflict', row: key });
          return;
        }
        draft.invocations[event.attemptId] = {
          ...invocation,
          settled: {
            outcome: event.outcome,
            chargedCreditAtoms: event.outcome === 'voided' ? '0' : event.chargedCreditAtoms,
            row: key,
          },
        };
        if (draft.runs[invocation.runId]?.openInvocation === event.attemptId) {
          drop(entryOf(invocation.runId), 'openInvocation');
        }
        return;
      }
      case 'message.appended':
      case 'message.envelope-replaced': {
        const message = event.type === 'message.appended' ? event.message : event.replacement;
        if (message.role === 'user') {
          noteTurn(entryOf(event.runId), message, event.runId);
          return;
        }
        const binding = message.metadata?.tauInternal;
        const attemptId = binding?.['attemptId'];
        const stop = message.metadata?.stopReason;
        if (
          message.role === 'assistant' &&
          binding?.['kind'] === 'billing-invocation' &&
          typeof attemptId === 'string' &&
          stop !== 'error' &&
          stop !== 'aborted'
        ) {
          markShown(attemptId);
        }
        return;
      }
      case 'history.compacted': {
        for (const attemptId of invocationsOfRun(event.runId, 'compaction')) {
          if (draft.invocations[attemptId]?.settled === undefined) {
            markShown(attemptId);
          }
        }
        return;
      }
      case 'turn.history-projection-committed': {
        const entry = entryOf(event.runId);
        entry.committed = true;
        noteTurn(entry, event.message, event.runId);
        break;
      }
      default: {
        break;
      }
    }
  };

  /** Fold one row; `false` when it was a redelivery and changed nothing. */
  const stepClassified = (
    classified:
      | ClassifiedRow
      | Readonly<{ class: 'known'; event: KnownProjectionEvent }>
      | Readonly<{
          class: 'opaque';
          event: Extract<ProjectionFact, { classification: 'opaque' }>['row'] & { type: string };
          affectsHistory: boolean;
        }>,
  ): boolean => {
    if (classified.class === 'quarantined') {
      // A lost line may have been history; the chat still reads, but it no longer runs (CL-S2).
      draft.anomalies.push({ kind: 'quarantined' });
      draft.historyIntact = false;
      return true;
    }
    const { event } = classified;
    const key = keyOf(event);
    const term = draft.terms[event.leaderEpoch];
    if (term !== undefined && event.sequence <= term.lastSequence) {
      return false;
    }
    const epoch = event.epoch ?? 0;
    const opensTerm = term === undefined;
    const broken = opensTerm
      ? event.sequence !== 0 || (event.epoch === undefined ? draft.maxEpoch > 0 : epoch <= draft.maxEpoch)
      : draft.position.last?.leaderEpoch !== event.leaderEpoch ||
        event.sequence !== term.lastSequence + 1 ||
        epoch !== (term.epoch ?? 0);
    if (broken) {
      draft.anomalies.push({ kind: 'order', row: key });
    }
    draft.terms[event.leaderEpoch] = {
      ...(opensTerm
        ? event.epoch === undefined
          ? {}
          : { epoch: event.epoch }
        : term.epoch === undefined
          ? {}
          : { epoch: term.epoch }),
      lastSequence: event.sequence,
    };
    draft.maxEpoch = Math.max(draft.maxEpoch, epoch);
    const { cursor } = draft.position;
    draft.position = { cursor: cursor + 1, last: key };
    if (classified.class === 'opaque') {
      entryOf(event.runId).opaque = true;
      draft.anomalies.push({ kind: 'opaque', row: key });
      if ('affectsHistory' in classified ? classified.affectsHistory : historyRowTypes.has(event.type)) {
        draft.historyIntact = false;
        draft.newerHistory = true;
      }
    } else {
      known(classified.event, key);
    }
    if (event.commandId !== undefined && draft.applied[event.commandId] === undefined) {
      const attempt = draft.runs[event.runId]?.attempt;
      draft.applied[event.commandId] = { cursor, runId: event.runId, ...(attempt === undefined ? {} : { attempt }) };
    }
    return true;
  };

  const stepPhysical = (classified: Parameters<typeof stepClassified>[0]): void => {
    const { cursor, last } = draft.position;
    stepClassified(classified);
    const key = classified.class === 'quarantined' ? last : keyOf(classified.event);
    draft.position = { cursor: cursor + 1, ...(key === undefined ? {} : { last: key }) };
  };
  return { draft, step: (value: unknown) => stepClassified(classifyLogRow(value)), stepClassified, stepPhysical };
};

/**
 * Fold rows into a ledger (I5): total, never throws, returns its input when nothing changes, and skips a row whose
 * sequence is at or below its term's last folded sequence as a redelivery. Every other row advances the position,
 * opaque rows included; a row it cannot use is an anomaly. Rows are JSON as read: the fold is the tolerant reader.
 *
 * @param ledger - The ledger so far.
 * @param rows - The next rows, in log order.
 * @returns The ledger after the rows.
 * @public
 */
export const foldChatLedger = (ledger: ChatLedger, rows: readonly unknown[]): ChatLedger => {
  const fold = createFold(ledger);
  let changed = false;
  for (const row of rows) {
    changed = fold.step(row) || changed;
  }
  return changed ? fold.draft : ledger;
};

/** Fold a physical log interval; duplicate deliveries occupy a cursor but apply no semantic effect. @internal */
export const foldPhysicalChatLedger = (ledger: ChatLedger, rows: readonly unknown[]): ChatLedger => {
  if (rows.length === 0) {
    return ledger;
  }
  const fold = createFold(ledger);
  for (const row of rows) {
    fold.stepPhysical(classifyLogRow(row));
  }
  return fold.draft;
};

/** Fold privately owned parser witnesses without repeating their structural classification. @internal */
export const foldClassifiedChatLedger = (ledger: ChatLedger, rows: readonly ReadRow[]): ChatLedger => {
  const fold = createFold(ledger);
  for (const row of rows) {
    // Kept physical rows advance acquisition even when their semantic effect is a duplicate delivery.
    fold.stepPhysical(row.opaque ? { class: 'opaque', event: row.event } : { class: 'known', event: row.event });
  }
  return rows.length > 0 ? fold.draft : ledger;
};

/** Position-qualified compact facts submitted to the shared ledger transitions. @public */
export type FoldProjectionFactsInput = Readonly<{ ledger: ChatLedger; answer: ProjectionBatch }>;

/**
 * Fold a complete valid compact page through the canonical ledger transitions, without partial advancement.
 * @param input - The current ledger and the compact page.
 * @returns The same position/reset outcomes as a canonical read; malformed compact pages are stale.
 * @public
 */
export const foldProjectionFacts = ({ ledger, answer }: FoldProjectionFactsInput): ReadFold => {
  const parsed = projectionBatchSchema.safeParse(answer);
  if (!parsed.success) {
    return { kind: 'stale' };
  }
  const batch = parsed.data;
  const mine = ledger.position.cursor;
  if (batch.cursor !== mine) {
    return batch.cursor < mine && batch.cursor === batch.endCursor && batch.facts.length === 0
      ? { kind: 'reset', reason: 'clamped' }
      : { kind: 'stale' };
  }
  if (ledger.position.sourceGeneration !== undefined && batch.sourceGeneration !== ledger.position.sourceGeneration) {
    return { kind: 'reset', reason: 'identity-mismatch' };
  }
  const fold = createFold(ledger);
  for (const fact of batch.facts) {
    if (fact.classification === 'known') {
      fold.stepPhysical({ class: 'known', event: { ...fact.row, ...fact.effect } });
    } else {
      fold.stepPhysical({
        class: 'opaque',
        event: { ...fact.row, type: fact.eventType },
        affectsHistory: fact.affectsHistory,
      });
    }
  }
  const last = batch.facts.at(-1)?.row ?? ledger.position.last;
  return {
    kind: 'folded',
    ledger: {
      ...fold.draft,
      position: {
        cursor: batch.nextCursor,
        sourceGeneration: batch.sourceGeneration,
        ...(last === undefined ? {} : { last: keyOf(last) }),
      },
    },
  };
};

/** The shape of one read's answer the fold needs; the seam contract's `ReadAnswer` is assignable to it. @internal */
export type LedgerReadAnswer =
  | Readonly<{
      status: 'batch';
      cursor: number;
      nextCursor: number;
      endCursor: number;
      events: readonly unknown[];
      sourceGeneration?: string;
      sourceHealth?: ProjectionSourceHealth;
    }>
  | Readonly<{ status: 'refused'; reason: 'cursor-ahead' | 'identity-mismatch' | 'owner-fenced' | 'unreadable' }>;

/** What a reader does with one read's answer (CL-R13). @public */
export type ReadFold =
  | Readonly<{ kind: 'folded'; ledger: ChatLedger }>
  /** The batch does not start at this cursor: discard it and read again. */
  | Readonly<{ kind: 'stale' }>
  /** Refold from `emptyChatLedger` at cursor 0. `clamped` is a version-1 server's clamp, detected. */
  | Readonly<{ kind: 'reset'; reason: 'cursor-ahead' | 'identity-mismatch' | 'clamped' }>
  /** The reader's owner decides: address a newer generation, or report. */
  | Readonly<{ kind: 'refused'; reason: 'owner-fenced' | 'unreadable' }>;

/**
 * Check one read's answer against the reader's position, and fold it when it fits (I4, T5). Cursor comparison is the
 * complete detector on an append-only log: a batch at another cursor is stale, a version-1 clamp (an empty batch at
 * the end of a log shorter than the reader's cursor) resets, and a refusal resets or goes to the reader's owner.
 *
 * @param ledger - The reader's ledger.
 * @param answer - One read's answer, from the log or the wire.
 * @returns What to do next, with the folded ledger when it fits.
 * @public
 */
export const foldReadAnswer = (ledger: ChatLedger, answer: LedgerReadAnswer): ReadFold => {
  if (answer.status === 'refused') {
    return answer.reason === 'cursor-ahead' || answer.reason === 'identity-mismatch'
      ? { kind: 'reset', reason: answer.reason }
      : { kind: 'refused', reason: answer.reason };
  }
  const mine = ledger.position.cursor;
  if (answer.cursor !== mine) {
    return answer.cursor < mine && answer.cursor === answer.endCursor && answer.events.length === 0
      ? { kind: 'reset', reason: 'clamped' }
      : { kind: 'stale' };
  }
  if (answer.nextCursor !== answer.cursor + answer.events.length || answer.endCursor < answer.nextCursor) {
    return { kind: 'stale' };
  }
  if (ledger.position.sourceGeneration !== undefined && answer.sourceGeneration !== ledger.position.sourceGeneration) {
    return { kind: 'reset', reason: 'identity-mismatch' };
  }
  if (answer.events.length === 0) {
    const observed =
      answer.sourceHealth === undefined
        ? ledger
        : {
            ...ledger,
            historyIntact: ledger.historyIntact && answer.sourceHealth.historyIntact,
            newerHistory: ledger.newerHistory || answer.sourceHealth.newerHistory,
          };
    return {
      kind: 'folded',
      ledger:
        answer.sourceGeneration === ledger.position.sourceGeneration
          ? observed
          : {
              ...observed,
              position: { ...ledger.position, sourceGeneration: answer.sourceGeneration },
            },
    };
  }
  const rawFolded = foldPhysicalChatLedger(ledger, answer.events);
  const folded =
    answer.sourceHealth === undefined
      ? rawFolded
      : {
          ...rawFolded,
          historyIntact: rawFolded.historyIntact && answer.sourceHealth.historyIntact,
          newerHistory: rawFolded.newerHistory || answer.sourceHealth.newerHistory,
        };
  const last = classifyLogRow(answer.events.at(-1));
  // The server's cursor is authoritative for an aligned batch, whatever the fold skipped.
  return {
    kind: 'folded',
    ledger: {
      ...folded,
      position: {
        cursor: answer.nextCursor,
        ...(answer.sourceGeneration === undefined ? {} : { sourceGeneration: answer.sourceGeneration }),
        ...(last.class === 'quarantined'
          ? folded.position.last
            ? { last: folded.position.last }
            : {}
          : { last: keyOf(last.event) }),
      },
    },
  };
};

/**
 * Attempts that ended and have no settlement row, for reconciliation (D10; W8).
 *
 * @param ledger - The chat's ledger.
 * @returns One entry per unsettled attempt.
 * @public
 */
export const unsettledAttempts = (
  ledger: ChatLedger,
): ReadonlyArray<Readonly<{ runId: string; turnId?: string; attempt: number }>> =>
  Object.entries(ledger.runs).flatMap(([runId, entry]) =>
    entry.appendState === 'terminal'
      ? [{ runId, attempt: entry.attempt, ...(entry.turnId === undefined ? {} : { turnId: entry.turnId }) }]
      : [],
  );

/** How a replayed `start` without a command id is answered. @public */
export type ReplayedStartOutcome =
  /** No lifecycle row names the run: admit it. */
  | 'admit'
  /** The turn is committed and the run has not ended: continue it. */
  | 'resume'
  /** The turn is committed and the run ended: answer with the log. */
  | 'settled'
  /** A dead leader admitted the run and never committed its turn (L2a D6): the run owner recovers it. */
  | 'recover';

/**
 * Decide how to answer a replayed `start` from the chat's ledger (V9). M1 answers commands with ids from `applied`;
 * this answers version-1 starts without one.
 *
 * @param ledger - The chat's ledger.
 * @param runId - The run the command names.
 * @returns Whether to admit, resume, answer as settled, or recover an orphaned admission.
 * @public
 */
export const replayedStartOutcome = (ledger: ChatLedger, runId: string): ReplayedStartOutcome => {
  const entry = ledger.runs[runId];
  if (entry?.lifecycle === undefined) {
    return 'admit';
  }
  const ended = endedStates.has(entry.lifecycle);
  if (entry.committed) {
    return ended ? 'settled' : 'resume';
  }
  return ended ? 'resume' : 'recover';
};

/**
 * Whether another account funded the attempt: its prepared row names a principal other than `principal`. Such an
 * attempt is never resolved, voided or recorded here (RV5-F2, W11 GI-Q6).
 *
 * @internal
 * @param entry - The attempt.
 * @param principal - The account the transport funds calls as, if it says.
 * @returns `true` when the attempt is another account's.
 */
export const isForeignInvocation = (entry: InvocationEntry, principal: string | undefined): boolean =>
  entry.principal !== undefined && entry.principal !== principal;

/**
 * Every prepared model invocation with neither a shown reply nor a settled row, across runs (GI-R10).
 *
 * @internal
 * @param ledger - The chat's ledger.
 * @returns Their attempt ids, in preparation order.
 */
export const unresolvedInvocations = (ledger: ChatLedger): readonly string[] =>
  Object.entries(ledger.invocations).flatMap(([attemptId, invocation]) =>
    !invocation.shown && invocation.settled === undefined ? [attemptId] : [],
  );

/**
 * Whether the chat's current run has a row this build cannot read, or its history holds a newer build's row
 * (`RUN_UNREADABLE`, answered with an update), or the history cannot be replayed (`HISTORY_INVALID`): a command on such
 * a chat is refused (CL-R2, read tolerantly, execute strictly; D16).
 *
 * @internal
 * @param ledger - The chat's ledger.
 * @returns The refusal code, or `undefined` when the run can be executed.
 */
export const executionRefusal = (ledger: ChatLedger): 'RUN_UNREADABLE' | 'HISTORY_INVALID' | undefined => {
  if (ledger.newerHistory || (ledger.currentRunId !== undefined && ledger.runs[ledger.currentRunId]?.opaque === true)) {
    return 'RUN_UNREADABLE';
  }
  return ledger.historyIntact ? undefined : 'HISTORY_INVALID';
};

/** The run operation table (`run-operation.legality.json`): `ok` or the refusal code. @internal */
export const runOperationCode = (state: ChatRunState, operation: 'admit' | 'resume'): string =>
  operationTable.table[state][operation];

/** The gate's answer: the ledger after the rows, or the first refused row. @internal */
export type GateAnswer = Readonly<{ ok: true; ledger: ChatLedger } | { ok: false; code: string; row: number }>;

/**
 * The pure append gate (W7 RA-R6): folds the stamped rows one at a time and refuses the batch at the first row that
 * breaks a legality table, opens a run or an attempt while another run of the chat is open (`CHAT_RUN_LIVE`), or,
 * with `invocations`, prepares a generation step while its run holds an unresolved generation — or, for an attempt's
 * first step, while the chat holds any unresolved invocation (`INVOCATION_UNRESOLVED`; RV1-F3, EQ1). A compaction's
 * summarizer calls are exempt: its `history.compacted` row closes them. An identical repeat of an attempt's settlement is not refused; its writer
 * drops it ({@link isRepeatSettlement}).
 *
 * @internal
 * @param ledger - The ledger the rows land on.
 * @param rows - The stamped rows, in order.
 * @param options - `invocations: false` skips the invocation rule until its writers land (W7 GI-S6).
 * @returns The ledger after the batch, which the writer adopts once the append is durable, or the refusal.
 */
export const gateRows = (
  ledger: ChatLedger,
  rows: readonly AgentLogEvent[],
  options: Readonly<{ invocations?: boolean }> = {},
): GateAnswer => {
  let current = ledger;
  for (const [index, row] of rows.entries()) {
    const code = gateCode(current, row, options.invocations ?? true);
    if (code !== undefined) {
      return { ok: false, code, row: index };
    }
    current = foldChatLedger(current, [row]);
  }
  return { ok: true, ledger: current };
};

const gateCode = (ledger: ChatLedger, row: AgentLogEvent, invocations: boolean): string | undefined => {
  const entry = ledger.runs[row.runId];
  if (row.type === 'run.lifecycle') {
    const code = lifecycleTable.table[lifecycleCondition(entry)][row.state];
    if (code !== 'ok') {
      return code;
    }
    const opens = row.state === 'admitted' || (entry !== undefined && reopens(entry, row));
    if (opens && ledger.currentRunId !== undefined && ledger.currentRunId !== row.runId) {
      const state = chatRunState(ledger);
      if (state !== 'none' && state !== 'terminal') {
        return 'CHAT_RUN_LIVE';
      }
    }
    return undefined;
  }
  if (row.type === 'turn.changed') {
    return entry?.turnId === row.turnId && row.attempt <= entry.attempt ? undefined : 'TURN_CHANGE_UNPLACED';
  }
  if (settlementTypes.has(row.type)) {
    const attempt = statedAttempt(row) ?? entry?.attempt ?? 1;
    const prior = entry?.settlements.find((recorded) => recorded.attempt === attempt);
    if (prior !== undefined) {
      return settlementBody(prior.event) === settlementBody(row) ? undefined : 'SETTLEMENT_CONFLICT';
    }
    const state =
      entry?.lifecycle === undefined || attempt > entry.attempt
        ? 'unadmitted'
        : attempt < entry.attempt || entry.appendState === 'settled'
          ? 'settled'
          : entry.appendState;
    const code = settlementTable.table[state].settle;
    return code === 'ok' ? undefined : code;
  }
  if (row.type === 'interrupt.recorded' && row.phase === 'resolved') {
    return entry?.resolvedInterrupts?.includes(row.interruptId) ? 'INTERRUPT_ALREADY_RESOLVED' : undefined;
  }
  if (invocations && row.type === 'model.invocation-prepared' && row.purpose === 'generation') {
    const attempt = entry?.attempt ?? 1;
    const firstOfAttempt = !Object.values(ledger.invocations).some(
      (invocation) => invocation.runId === row.runId && invocation.attempt === attempt,
    );
    // Any unresolved generation of the run, not only the last prepared one: a compaction replaces `openInvocation`.
    const blocked = firstOfAttempt
      ? unresolvedInvocations(ledger).length > 0
      : unresolvedInvocations(ledger).some((attemptId) => {
          const invocation = ledger.invocations[attemptId]!;
          return invocation.runId === row.runId && invocation.purpose === 'generation';
        });
    return blocked ? 'INVOCATION_UNRESOLVED' : undefined;
  }
  return undefined;
};

/**
 * Whether a settlement row repeats its attempt's recorded settlement exactly: at-least-once delivery makes a repeat a
 * no-op, not a refusal (V10).
 *
 * @internal
 */
export const isRepeatSettlement = (ledger: ChatLedger, row: AgentLogEvent): boolean => {
  if (!settlementTypes.has(row.type)) {
    return false;
  }
  const entry = ledger.runs[row.runId];
  const attempt = statedAttempt(row) ?? entry?.attempt ?? 1;
  const prior = entry?.settlements.find((recorded) => recorded.attempt === attempt);
  return prior !== undefined && settlementBody(prior.event) === settlementBody(row);
};

/** Input for {@link stampRows}. @internal */
export type StampRowsInput = Readonly<{
  ledger: ChatLedger;
  leaderEpoch: string;
  runId: string;
  recordedAt: string;
  commandId?: string;
  bodies: readonly LogRowBody[];
}>;

/** The attempt a body states, when it states one from 1 (a legacy 0 states none). */
const statedBodyAttempt = (body: LogRowBody): number | undefined =>
  'attempt' in body && typeof body.attempt === 'number' && body.attempt > 0 ? body.attempt : undefined;

/**
 * Stamp one append's bodies: the term's epoch (one above every epoch in the ledger for a new term: its claim, D5),
 * next sequences, the command id, and the attempt of each lifecycle and settlement row.
 *
 * @internal
 * @param input - The ledger the rows land on, the writer's term, and the bodies.
 * @returns The stamped rows, in order.
 */
export const stampRows = (input: StampRowsInput): readonly AgentLogEvent[] => {
  let { ledger } = input;
  const term = ledger.terms[input.leaderEpoch];
  const epoch = term === undefined ? ledger.maxEpoch + 1 : term.epoch;
  let sequence = term === undefined ? 0 : term.lastSequence + 1;
  return input.bodies.map((body) => {
    const entry = ledger.runs[input.runId] ?? stubEntry();
    const attempt =
      body.type === 'run.lifecycle'
        ? body.state === 'admitted'
          ? 1
          : reopens(entry, body)
            ? entry.attempt + 1
            : entry.attempt
        : settlementTypes.has(body.type)
          ? /* N4: a settlement keeps the attempt it states; only an attempt-less legacy body takes the current one. */
            (statedBodyAttempt(body) ?? entry.attempt)
          : undefined;
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a spread of the body union cannot narrow to one record shape.
    const row = {
      ...body,
      version: 1,
      leaderEpoch: input.leaderEpoch,
      ...(epoch === undefined ? {} : { epoch }),
      sequence,
      recordedAt: input.recordedAt,
      runId: input.runId,
      ...(input.commandId === undefined ? {} : { commandId: input.commandId }),
      ...(attempt === undefined ? {} : { attempt }),
    } as AgentLogEvent;
    sequence += 1;
    ledger = foldChatLedger(ledger, [row]);
    return row;
  });
};
