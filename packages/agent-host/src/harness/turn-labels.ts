import type { AgentLogEvent } from '#log/event-types.js';
import type { GatewayTurnGap, GatewayTurnLabels } from '#wire/gateway.js';

/** The provider's short cache lifetime, in milliseconds: a pause this long finds a five-minute entry gone. */
const shortCacheLifetime = 5 * 60_000;
/** The provider's long cache lifetime, the one-hour tier, in milliseconds. */
const longCacheLifetime = 60 * 60_000;

/**
 * The gap bucket of a pause between two model steps. Each edge belongs to the bucket above it, since an entry is gone
 * at its lifetime, not after it; a negative pause (another device's clock ahead of this one) is the shortest bucket.
 *
 * @internal
 * @param pause - Milliseconds from the chat's previous model step to this turn's first step.
 * @returns The bucket the gateway records.
 */
export const turnGapOf = (pause: number): Exclude<GatewayTurnGap, 'first_turn'> => {
  if (pause < shortCacheLifetime) {
    return 'lt_5m';
  }
  return pause < longCacheLifetime ? '5m_60m' : 'gt_60m';
};

/**
 * Whether a row is a model step as the log records it: the assistant message its stream appended.
 *
 * @param event - One row of the chat.
 * @returns Whether the row is an assistant `message.appended`.
 */
const isModelStep = (event: AgentLogEvent): boolean =>
  event.type === 'message.appended' && event.message.role === 'assistant';

/**
 * A run's turn labels, read from the chat's rows rather than from any one session's memory, so a run resumed on this
 * or another device labels its steps the way the run that started them would have.
 *
 * The step is `first` until the run has a model step in the log and `continuation` after. The gap runs from the
 * chat's previous model step (the newest assistant `message.appended` of another run) to the turn's first step: now,
 * when this is the first step, or the run's own first model step row when the run already had one.
 *
 * @internal
 * @param input - The chat's rows in the history's order (every device's), the run, and the current time.
 * @returns The labels for the run's next step.
 */
export const turnLabelsOf = (input: {
  readonly rows: readonly AgentLogEvent[];
  readonly runId: string;
  /** Milliseconds since the epoch. */
  readonly now: number;
}): GatewayTurnLabels => {
  const runStart = input.rows.findIndex((event) => event.runId === input.runId && isModelStep(event));
  const before = runStart === -1 ? input.rows : input.rows.slice(0, runStart);
  const previous = before.findLast((event) => event.runId !== input.runId && isModelStep(event));
  const step = runStart === -1 ? 'first' : 'continuation';
  if (previous === undefined) {
    return { step, gap: 'first_turn' };
  }
  const turnStart = runStart === -1 ? input.now : Date.parse(input.rows[runStart]!.recordedAt);
  const pause = turnStart - Date.parse(previous.recordedAt);
  return Number.isNaN(pause) ? { step } : { step, gap: turnGapOf(pause) };
};
