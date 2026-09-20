/**
 * The chat log's admission and attempt invariants, as a pure fold.
 *
 * Separate from `chat-admission.ts` because this half has no browser in it: the
 * invariant is arithmetic over records, and arithmetic is cheaper to pin in a
 * node row than in a four-minute browser vertical. `chat-admission.ts` builds
 * `expectLogInvariant` on it.
 *
 * The unit is the **attempt**, not the run (blueprint I1: one attempt, one
 * lease, one settlement; a run has one or more attempts). A resumable failure
 * is reopened by a `running` row, runs again under the same run id and settles
 * again, so a fold keyed on the run read the second attempt's rows as a
 * duplicate writer and a write into a settled ledger. The split and the
 * per-attempt clauses mirror the host's own legality fold — `runLedgerOf` and
 * `isHostLifecycleLegal` in `packages/agent-host/src/host/tau-agent-host.ts` —
 * rather than restating it differently.
 */

/** One durable record, as far as these rows read it. */
export type LogRecord = Readonly<{ runId: string; type: string; state?: string; reason?: string }>;

/** The three settlement records; an attempt records exactly one of them. */
export const settlementTypes = new Set(['turn.finalized', 'turn.conflicted', 'turn.failed']);

/*
 * `hostRunStateOfLifecycle`: `admitted`, `running` and `paused` are the states
 * an attempt passes through; every other lifecycle state ends it.
 */
const endingStates = new Set(['completed', 'failed', 'cancelled']);

/*
 * States that can legitimately repeat inside one attempt — a `paused` run whose
 * interrupt is answered goes back to `running`. Every other state names a
 * transition that happens once, so a second copy is a second writer.
 */
const repeatableStates = new Set(['running', 'paused']);

/**
 * Split one run's records into its attempts, oldest first.
 *
 * Mirrors `runLedgerOf`: a `running` row arriving when the attempt already
 * holds a settlement reopens the run and starts the next attempt. A settlement
 * that lands while the attempt is still executing closed its *lease*, not its
 * execution — the run still owes the log the record of how it ended, so that
 * record stays in the same attempt.
 *
 * @param records - One run's records, in log order.
 * @returns Its attempts, each in log order.
 */
export const attemptsOf = (records: readonly LogRecord[]): ReadonlyArray<readonly LogRecord[]> => {
  const attempts: LogRecord[][] = [[]];
  let settled = false;
  for (const record of records) {
    if (record.type === 'run.lifecycle' && record.state === 'running' && settled) {
      attempts.push([]);
      settled = false;
    }
    attempts.at(-1)!.push(record);
    if (settlementTypes.has(record.type)) {
      settled = true;
    }
  }
  return attempts;
};

/** One clause one run broke; `attempt` is 1-based, or `0` for a run-wide clause. */
export type LogViolation = Readonly<{ runId: string; attempt: number; reason: string }>;

/** What one chat's log must hold once its gestures have settled. */
export type ChatLogExpectation = Readonly<{
  /** How many runs the chat admitted. */
  runs: number;
  /**
   * Every settlement the chat recorded, flat, in log order.
   *
   * Flat rather than one per run because a reopened run settles once per
   * attempt: the count alone passed a cancelled run that settled
   * `turn.finalized`, so a row that drives a stop, a refusal or an abandonment
   * names the kinds.
   */
  settlements?: readonly string[];
  /**
   * Attempts per run, oldest run first. Default: one each.
   *
   * A second attempt is a second provider call for the same turn. It is legal —
   * the person asked for it — but it is never silent, so a row that expects one
   * says so.
   */
  attempts?: readonly number[];
  /**
   * Milliseconds to wait for the log to hold. Default 60 000.
   *
   * A takeover's record waits on the Web Lock the departed document held, which
   * no poll of this log can hurry.
   */
  timeoutMilliseconds?: number;
}>;

/** One chat log measured against its expectation; `violations` empty means it holds. */
export type ChatLogFold = Readonly<{
  runs: number;
  settlements?: readonly string[];
  attempts?: readonly number[];
  violations: readonly LogViolation[];
}>;

/** Every clause one attempt breaks, in the order they are checked. */
const violationsOfAttempt = (records: readonly LogRecord[]): readonly string[] => {
  const reasons: string[] = [];
  const lifecycle = records.filter((record) => record.type === 'run.lifecycle');
  const settlements = records.filter((record) => settlementTypes.has(record.type));

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const state of lifecycle.map((record) => record.state ?? 'unknown')) {
    if (repeatableStates.has(state)) {
      continue;
    }
    if (seen.has(state)) {
      duplicates.push(state);
    }
    seen.add(state);
  }
  if (duplicates.length > 0) {
    reasons.push(`duplicate lifecycle rows: ${duplicates.join(', ')}`);
  }

  /* Closed = ended AND settled (`isHostLifecycleLegal`). The only row legal
   * after that is the `running` that reopens the run, and that row has already
   * been split into the next attempt. */
  let ended = false;
  let settled = false;
  for (const record of records) {
    if (record.type === 'run.lifecycle' && ended && settled) {
      reasons.push(`lifecycle row after the attempt closed: ${record.state ?? 'unknown'}`);
    }
    if (record.type === 'run.lifecycle' && endingStates.has(record.state ?? '')) {
      ended = true;
    }
    if (settlementTypes.has(record.type)) {
      settled = true;
    }
  }

  if (settlements.length !== 1) {
    reasons.push(`settled ${String(settlements.length)} times, expected exactly once`);
  }

  /*
   * Only the first attempt carries the admission, so this is vacuous for the
   * rest. What it excludes is an abandoned lease's `turn.failed`, written under
   * a run id the host had never admitted and then read back as proof that it
   * had. A rewinding trigger legitimately writes `history.rewound` ahead of the
   * lifecycle row, so the clause is ordering against the *settlement*, not
   * "admission is the first record".
   */
  const admission = records.findIndex((record) => record.type === 'run.lifecycle' && record.state === 'admitted');
  const settlement = records.findIndex((record) => settlementTypes.has(record.type));
  if (admission !== -1 && settlement !== -1 && settlement < admission) {
    reasons.push('settled before it was admitted');
  }
  return reasons;
};

/**
 * Measure one chat's log against its expectation.
 *
 * Every optional key is echoed only when the caller asked for it, so the whole
 * fold goes through one `toEqual` and the failure prints the log's own shape
 * beside the wanted one.
 *
 * @param records - The chat's whole log.
 * @param expected - What the row expects to find.
 * @returns The measured fold.
 */
export const foldChatLog = (records: readonly LogRecord[], expected: ChatLogExpectation): ChatLogFold => {
  const runIds = [...new Set(records.map((record) => record.runId))];
  const attemptsByRun = runIds.map((runId) => attemptsOf(records.filter((record) => record.runId === runId)));
  const violations: LogViolation[] = [];
  for (const [index, attempts] of attemptsByRun.entries()) {
    const runId = runIds[index]!;
    const admissions = attempts
      .flat()
      .filter((record) => record.type === 'run.lifecycle' && record.state === 'admitted').length;
    if (admissions !== 1) {
      violations.push({ runId, attempt: 0, reason: `admitted ${String(admissions)} times, expected exactly once` });
    }
    for (const [position, attempt] of attempts.entries()) {
      for (const reason of violationsOfAttempt(attempt)) {
        violations.push({ runId, attempt: position + 1, reason });
      }
    }
  }
  return {
    runs: runIds.length,
    ...(expected.settlements === undefined
      ? {}
      : { settlements: records.filter((record) => settlementTypes.has(record.type)).map((record) => record.type) }),
    ...(expected.attempts === undefined ? {} : { attempts: attemptsByRun.map((attempts) => attempts.length) }),
    violations,
  };
};
