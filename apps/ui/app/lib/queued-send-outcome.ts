/**
 * What became of a send the composer replays with an abort signal, once that signal was aborted: `cancelled` when it
 * never reached the outbox or was taken back before any host was handed it, `sent` when it had gone past the point a
 * cancel can reach. The store records it; the composer reads it once the replay settles and says "Send cancelled."
 * only when it is true (staging re-check 7: the page said so, then sent).
 */
export type QueuedSendOutcome = 'cancelled' | 'sent';

const outcomes = new WeakMap<AbortSignal, QueuedSendOutcome>();

/**
 * Record a send's outcome. The first record stands: a send is settled once.
 *
 * @param signal - The send's abort signal.
 * @param outcome - What became of it.
 */
export function settleQueuedSend(signal: AbortSignal | undefined, outcome: QueuedSendOutcome): void {
  if (signal !== undefined && !outcomes.has(signal)) {
    outcomes.set(signal, outcome);
  }
}

/**
 * Read a send's recorded outcome.
 *
 * @param signal - The send's abort signal.
 * @returns The outcome, or `undefined` when the store never settled it (the send never reached the outbox).
 */
export function queuedSendOutcome(signal: AbortSignal): QueuedSendOutcome | undefined {
  return outcomes.get(signal);
}
