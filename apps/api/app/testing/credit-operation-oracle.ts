/**
 * The pure transition table of one `billing.credit_operation` row (gateway invocation blueprint, T1–T11): the oracle
 * the model-based PostgreSQL test compares the ledger with. Time is whole milliseconds on a virtual clock that stays
 * at 0; `tick` moves the row's deadlines back instead, as the test's privileged connection does in SQL.
 *
 * ponytail: T12 and T13 (recovery failure back-off and absorption) are not modelled; nothing in the model-based test
 * makes recovery fail. Add them with a fault-injecting command.
 */

/** Evidence kinds as the model sees them: final usage, an unknown outcome and a provider rejection. */
export type OracleEvidence = 'final' | 'unknown' | 'rejected';

/** One credit_operation row as the model sees it. */
export type OracleRow = {
  readonly dispatch: 'admitted' | 'intent_recorded' | 'accepted' | 'recovery_required';
  readonly customer: 'pending' | 'settled' | 'released' | 'absorbed';
  readonly generation: number;
  readonly dueAt: number;
  readonly leaseUntil: number | undefined;
  readonly intentAt: number | undefined;
  readonly cancelledAt: number | undefined;
  readonly evidence: ReadonlySet<OracleEvidence>;
};

/** The row, whether a lookup voided its key (T2), and the atoms the account holds for it. */
export type OracleState = {
  readonly row: OracleRow | undefined;
  readonly voided: boolean;
  readonly heldAtoms: number;
};

/** One writer, named by its ledger method. `stale` calls it with the generation before the row's current one. */
export type OracleCommand =
  | { readonly kind: 'admit' }
  | { readonly kind: 'resolve' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'intent'; readonly stale: boolean }
  | { readonly kind: 'accept'; readonly stale: boolean }
  | { readonly kind: 'evidence'; readonly evidence: OracleEvidence }
  | { readonly kind: 'finish'; readonly evidence: OracleEvidence; readonly stale: boolean }
  | { readonly kind: 'recover' }
  | { readonly kind: 'tick'; readonly minutes: number };

/** What the writer answered: applied, refused (no match, or an error), replayed, or voided. */
export type OracleAnswer = 'applied' | 'refused' | 'replayed' | 'voided';

/** The deadline admission sets and the atoms it holds, as the model-based test admits. */
export const oracleDeadline = 5 * 60_000;
export const oracleAuthorizedAtoms = 5;
const claimLease = 60_000;
const recoveryGrace = 5 * 60_000;
const now = 0;

/** The empty state before any writer ran. */
export const initialOracleState: OracleState = { row: undefined, voided: false, heldAtoms: 0 };

const terminal = (state: OracleState, row: OracleRow, customer: OracleRow['customer']): OracleState =>
  // GI-R2 (the dispatch CHECK): a settlement without a recorded intent is refused by the database.
  customer === 'settled' && row.intentAt === undefined
    ? { ...state, row }
    : { ...state, row: { ...row, customer }, heldAtoms: 0 };

const outcomeOf = (evidence: OracleEvidence): OracleRow['customer'] =>
  evidence === 'final' ? 'settled' : evidence === 'rejected' ? 'released' : 'absorbed';

/**
 * Applies one writer (T1–T11) to the state at database time 0.
 *
 * @param state - The state before the writer.
 * @param command - The writer and its arguments.
 * @returns The state after the writer and the writer's answer.
 */
// oxlint-disable-next-line max-lines-per-function, complexity -- one switch arm per row of the transition table
export const step = (
  state: OracleState,
  command: OracleCommand,
): { readonly state: OracleState; readonly answer: OracleAnswer } => {
  const { row } = state;
  const current = (stale: boolean): number => (row?.generation ?? 0) - (stale ? 1 : 0);
  switch (command.kind) {
    case 'admit': {
      // T1, T1r and the void refusal.
      if (row) {
        return { state, answer: 'replayed' };
      }
      if (state.voided) {
        return { state, answer: 'refused' };
      }
      return {
        state: {
          ...state,
          heldAtoms: oracleAuthorizedAtoms,
          row: {
            dispatch: 'admitted',
            customer: 'pending',
            generation: 1,
            dueAt: now + oracleDeadline,
            leaseUntil: undefined,
            intentAt: undefined,
            cancelledAt: undefined,
            evidence: new Set(),
          },
        },
        answer: 'applied',
      };
    }
    case 'resolve': {
      // T2: a lookup voids a key with no row, under admission's lock.
      return row ? { state, answer: 'replayed' } : { state: { ...state, voided: true }, answer: 'voided' };
    }
    case 'cancel': {
      // T3.
      if (row?.customer !== 'pending' || row.cancelledAt !== undefined) {
        return { state, answer: 'refused' };
      }
      return { state: { ...state, row: { ...row, cancelledAt: now } }, answer: 'applied' };
    }
    case 'intent': {
      // T4.
      if (
        row?.generation !== current(command.stale) ||
        row.customer !== 'pending' ||
        row.dispatch !== 'admitted' ||
        row.cancelledAt !== undefined ||
        row.dueAt <= now
      ) {
        return { state, answer: 'refused' };
      }
      return { state: { ...state, row: { ...row, dispatch: 'intent_recorded', intentAt: now } }, answer: 'applied' };
    }
    case 'accept': {
      // T6.
      if (
        row?.generation !== current(command.stale) ||
        row.customer !== 'pending' ||
        row.dispatch !== 'intent_recorded' ||
        row.dueAt <= now
      ) {
        return { state, answer: 'refused' };
      }
      return { state: { ...state, row: { ...row, dispatch: 'accepted' } }, answer: 'applied' };
    }
    case 'evidence': {
      // T7: unfenced, allowed after the terminal state.
      if (!row) {
        return { state, answer: 'refused' };
      }
      return {
        state: { ...state, row: { ...row, evidence: new Set([...row.evidence, command.evidence]) } },
        answer: 'applied',
      };
    }
    case 'finish': {
      // T8, the live path: record the evidence, then terminalize under the caller's generation.
      if (!row) {
        return { state, answer: 'refused' };
      }
      const observed = { ...row, evidence: new Set([...row.evidence, command.evidence]) };
      if (row.generation !== current(command.stale)) {
        return { state: { ...state, row: observed }, answer: 'refused' };
      }
      if (row.customer !== 'pending') {
        return { state: { ...state, row: observed }, answer: 'replayed' };
      }
      const next = terminal(state, observed, outcomeOf(command.evidence));
      return { state: next, answer: next.row?.customer === 'pending' ? 'refused' : 'applied' };
    }
    case 'recover': {
      // T9 claims, then T10 defers or T11 resolves, in one pass.
      if (row?.customer !== 'pending' || row.dueAt > now || (row.leaseUntil !== undefined && row.leaseUntil > now)) {
        return { state, answer: 'refused' };
      }
      const claimed: OracleRow = {
        ...row,
        generation: row.generation + 1,
        dispatch: 'recovery_required',
        leaseUntil: now + claimLease,
      };
      if (row.evidence.size === 0 && row.intentAt !== undefined && now < row.dueAt + recoveryGrace) {
        return { state: { ...state, row: { ...claimed, leaseUntil: row.dueAt + recoveryGrace } }, answer: 'applied' };
      }
      const evidence: OracleEvidence =
        row.intentAt === undefined ? 'rejected' : row.evidence.has('final') ? 'final' : 'unknown';
      const recorded = { ...claimed, evidence: new Set([...claimed.evidence, evidence]) };
      return {
        state: terminal(state, recorded, row.intentAt === undefined ? 'released' : outcomeOf(evidence)),
        answer: 'applied',
      };
    }
    case 'tick': {
      if (!row) {
        return { state, answer: 'applied' };
      }
      const shift = command.minutes * 60_000;
      return {
        state: {
          ...state,
          row: {
            ...row,
            dueAt: row.dueAt - shift,
            leaseUntil: row.leaseUntil === undefined ? undefined : row.leaseUntil - shift,
          },
        },
        answer: 'applied',
      };
    }
  }
};
