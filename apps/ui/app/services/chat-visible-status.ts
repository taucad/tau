import type { ChatStatus } from 'ai';
import { selectRunPhase } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';

/**
 * A chat's status (T3): the host log's run phase, else the command this page has sent and whose run the log does not
 * hold yet. Nothing reads a stream's status; the log owns the run and its failure.
 *
 * @param projection - The chat's projection, if this page read any of its log.
 * @param awaitingRun - Whether a command this page sent has not reached the log as a run yet.
 * @returns `submitted` while a run is admitted or awaited, `streaming` while it runs, else `ready`.
 * @public
 */
export const selectVisibleChatStatus = (
  projection: ChatProjection | undefined,
  awaitingRun: boolean,
): Exclude<ChatStatus, 'error'> => {
  const phase = projection === undefined ? 'none' : selectRunPhase(projection);
  if (phase === 'running') {
    return 'streaming';
  }
  return phase === 'admitted' || awaitingRun ? 'submitted' : 'ready';
};
