/**
 * What a replayed `start` should do with the run its command names (V9).
 *
 * A caller that re-sends one `start` — a browser worker replaying the command
 * it was answering after re-acquiring leadership, a daemon client re-issuing
 * its turn over a reconnected socket — must not be answered by admitting the
 * same turn twice, nor refused because the run id is taken. The run id is the
 * idempotency key, and this is the one reading of the log that decides what it
 * means, shared by every placement.
 *
 * The fact that makes a run replay-resumable is its committed turn: a
 * `turn.history-projection-committed` is the record that carries the user's
 * message, so a run without one has nothing to continue and must be admitted.
 * Reading "the log's tail names this run and is not terminal" as "already
 * admitted" was wrong: the page can write a settlement under a run id whose
 * admission never happened, and that record made a *fresh* admission look like
 * a run in progress — so the caller resumed a phantom, the user's message was
 * never appended, and the provider re-answered the previous prompt.
 */

import type { AgentLogEvent } from '#log/event-types.js';

/** How a replayed `start` should be answered. @public */
export type ReplayedStartOutcome =
  /** No durable admission carries this command's turn; run it as a new one. */
  | 'admit'
  /** The turn is durably committed and its run has not ended; continue it. */
  | 'resume'
  /** The turn is durably committed and its run already ended; answer with the log. */
  | 'settled';

const terminalStates = new Set<string>(['completed', 'failed', 'cancelled']);

/**
 * Decide how to answer a replayed `start` from the chat's durable log.
 *
 * @param input - The chat's whole durable log and the run the command names.
 * @returns Whether to admit the command, resume its run, or answer as settled.
 * @public
 */
export const replayedStartOutcome = (input: {
  readonly events: readonly AgentLogEvent[];
  readonly runId: string;
}): ReplayedStartOutcome => {
  const committed = input.events.some(
    (event) => event.runId === input.runId && event.type === 'turn.history-projection-committed',
  );
  if (!committed) {
    return 'admit';
  }
  const lifecycle = input.events.findLast((event) => event.runId === input.runId && event.type === 'run.lifecycle');
  /* A committed turn is always preceded by its `admitted` marker, so a missing
   * lifecycle here can only mean a truncated log: continue rather than re-ask. */
  return lifecycle?.type === 'run.lifecycle' && terminalStates.has(lifecycle.state) ? 'settled' : 'resume';
};
