/**
 * The attempt a turn event addresses, and the record its lease leaves on disk.
 *
 * Plain data, beside `turn.machine`, so the package root can re-export them
 * while `xstate` stays an optional peer (W5 RM-S9, D10, D14).
 */

/**
 * One attempt of one run of one turn: the key every turn verb and answer carries (D14).
 *
 * A run id alone is ambiguous across attempts and a turn id alone across runs
 * (L7 F9), so the actor id, the lease record and a revision's provenance all
 * name the whole key.
 *
 * @public
 */
export type TurnAttemptKey = Readonly<{ chatId: string; turnId: string; runId: string; attempt: number }>;

/** Whether a turn's revision is the dirty base its placement found, or its result (RM-R9). @public */
export type TurnCut = 'base' | 'result';

/** The attempt a cut is minted for, and which of its two revisions it is. @public */
export type TurnCutOf = Readonly<{ key: TurnAttemptKey; turnCut: TurnCut }>;

/**
 * One attempt's lease record, as `.tau/runs/<runId>.json` holds it (S7, TS-R13).
 *
 * Written before the attempt's first mint (RM-R12), so the lease directory
 * indexes every minted attempt; a restarted root adopts it (RM-R14).
 *
 * @public
 */
export type TurnLease = Readonly<{
  runId: string;
  turnId: string;
  chatId: string;
  checkoutId: string;
  /** The run's attempt; `0` on a record written before W5 (W8 TS-Q5). */
  attempt: number;
  /** The checkout's head when the record was written, which bounds find-or-cut; absent on an unborn branch. */
  headRevisionId?: string;
  /** Milliseconds since the Unix epoch. */
  startedAt: number;
  /**
   * The root instance that holds the attempt (RM-R8 narrowed): another root adopts or retires the record only while
   * this root's liveness mark is free. Absent on a record written before W8, which any root may adopt (TS-Q5).
   */
  holder?: string;
}>;
