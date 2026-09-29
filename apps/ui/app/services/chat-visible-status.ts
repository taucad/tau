import { selectRunPhase } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';

/** The SDK may be ready after reload while the host still owns a live run. @public */
export const selectVisibleChatStatus = (
  sdkStatus: 'ready' | 'submitted' | 'streaming' | 'error',
  projection: ChatProjection | undefined,
): 'ready' | 'submitted' | 'streaming' | 'error' => {
  const phase = projection === undefined ? 'none' : selectRunPhase(projection);
  return phase === 'admitted' ? 'submitted' : phase === 'running' ? 'streaming' : sdkStatus;
};
