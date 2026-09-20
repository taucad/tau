/**
 * The chat log's admission and attempt invariants, as a pure fold.
 *
 * Separate from `chat-admission.ts` because this half has no browser in it: the
 * invariant is arithmetic over records, and arithmetic is cheaper to pin in a
 * node row than in a four-minute browser vertical. `chat-admission.ts` re-exports
 * everything here, so a spec still imports one module.
 *
 * What the previous fold missed — a cancelled run settling `turn.finalized`, a
 * run executed twice under one run id, a lifecycle row written into a settled
 * ledger — is blueprint Finding 10 and T5 (d).
 */

/** One durable record, as far as these rows read it. */
export type LogRecord = Readonly<{ runId: string; type: string; state?: string; reason?: string }>;

/** The three settlement records; a run records exactly one of them per attempt. */
export const settlementTypes = new Set(['turn.finalized', 'turn.conflicted', 'turn.failed']);

/*
 * A run is *reopened* by a lifecycle row that starts another attempt of it — a
 * resume, or the interrupt answer that unpauses one. Every other lifecycle state
 * names a transition that happens once per run, so a second copy of one is a
 * duplicate writer, and one after a settlement is a write into a closed ledger
 * (blueprint I1 and its legality table).
 */
const reopeningStates = new Set(['running', 'paused']);

/** How one run sits against the log's admission and attempt invariants (I1). */
export type RunShape = Readonly<{
  runId: string;
  /** `run.lifecycle: admitted` rows. Exactly one is legal. */
  admissions: number;
  /** `run.lifecycle: running` rows — one per attempt, so a second one is a second provider call. */
  executions: number;
  settlements: number;
  /** The kind the run's first settlement recorded, or `'none'`. */
  settlement: string;
  settlesAfterAdmission: boolean;
  /** Non-reopening lifecycle states written more than once. */
  duplicateLifecycle: readonly string[];
  /** Non-reopening lifecycle rows written after the run settled. */
  afterSettlement: readonly string[];
}>;

/**
 * How one run sits against the log's invariants.
 *
 * The invariant is *settlement follows admission*, not "admission is the first
 * record": a rewinding trigger writes its `history.rewound` from inside the same
 * `admit` call, ahead of the lifecycle row, so an edit's run legitimately opens
 * with the rewind. What an abandoned lease did is the thing being excluded — it
 * wrote `turn.failed` under a run id the host had never admitted, and the host
 * then read that record as proof the run *was* admitted.
 *
 * @param records - The chat's whole log.
 * @param runId - The run to shape.
 * @returns Its shape.
 */
export const shapeOf = (records: readonly LogRecord[], runId: string): RunShape => {
  const own = records.filter((record) => record.runId === runId);
  const lifecycle = own.filter((record) => record.type === 'run.lifecycle');
  const admission = own.findIndex((record) => record.type === 'run.lifecycle' && record.state === 'admitted');
  const settlement = own.findIndex((record) => settlementTypes.has(record.type));
  const seen = new Set<string>();
  const duplicateLifecycle: string[] = [];
  for (const state of lifecycle.map((record) => record.state ?? 'unknown')) {
    if (reopeningStates.has(state)) {
      continue;
    }
    if (seen.has(state)) {
      duplicateLifecycle.push(state);
    }
    seen.add(state);
  }
  return {
    runId,
    admissions: lifecycle.filter((record) => record.state === 'admitted').length,
    executions: lifecycle.filter((record) => record.state === 'running').length,
    settlements: own.filter((record) => settlementTypes.has(record.type)).length,
    settlement: own.find((record) => settlementTypes.has(record.type))?.type ?? 'none',
    settlesAfterAdmission: settlement === -1 || (admission !== -1 && settlement > admission),
    duplicateLifecycle,
    afterSettlement:
      settlement === -1
        ? []
        : own
            .slice(settlement + 1)
            .filter((record) => record.type === 'run.lifecycle' && !reopeningStates.has(record.state ?? 'unknown'))
            .map((record) => `${record.type}:${record.state ?? 'unknown'}`),
  };
};

/** What one chat's log must hold once its gestures have settled. */
export type ChatLogExpectation = Readonly<{
  /** How many runs the chat admitted. */
  runs: number;
  /**
   * The settlement kind each run recorded, oldest run first.
   *
   * The count alone passed a cancelled run that settled `turn.finalized`, so a
   * row that drives a stop, a refusal or an abandonment names the kinds.
   */
  settlements?: readonly string[];
  /**
   * Executions per run, oldest first. Default: one each.
   *
   * A run executed twice under one run id is a second provider call for a turn
   * the person already paid for, and no settlement count can see it.
   */
  executions?: readonly number[];
}>;

/** One chat log measured against its expectation; `violations` empty means it holds. */
export type ChatLogFold = Readonly<{
  runs: number;
  settlements?: readonly string[];
  executions?: readonly number[];
  violations: readonly RunShape[];
}>;

/**
 * Measure one chat's log against its expectation.
 *
 * Every optional key is echoed only when the caller asked for it, so the whole
 * fold can go through one `toEqual` and the failure prints the log's own shape
 * beside the wanted one.
 *
 * @param records - The chat's whole log.
 * @param expected - What the row expects to find.
 * @returns The measured fold.
 */
export const foldChatLog = (records: readonly LogRecord[], expected: ChatLogExpectation): ChatLogFold => {
  const runIds = [...new Set(records.map((record) => record.runId))];
  const shapes = runIds.map((runId) => shapeOf(records, runId));
  const executions = expected.executions ?? shapes.map(() => 1);
  return {
    runs: runIds.length,
    ...(expected.settlements === undefined ? {} : { settlements: shapes.map((shape) => shape.settlement) }),
    ...(expected.executions === undefined ? {} : { executions: shapes.map((shape) => shape.executions) }),
    violations: shapes.filter(
      (shape, index) =>
        shape.admissions !== 1 ||
        !shape.settlesAfterAdmission ||
        shape.duplicateLifecycle.length > 0 ||
        shape.afterSettlement.length > 0 ||
        shape.settlements !== (executions[index] ?? 1),
    ),
  };
};
