import type { ChatSidebarState } from '#types/chat-sidebar.types.js';

/**
 * What the chat history's bottom activity indicator may say.
 *
 * `waiting` is a paused or approval-gated run: the person's own control owns
 * that state, so the indicator speaks only once their answer is in.
 *
 * @public
 */
export type ChatActivityCue = Readonly<{
  kind: 'working' | 'waiting' | 'reconnecting';
  sentence: string;
}>;

/** The request facts the cue reads beside the run state. @public */
export type ChatActivityFacts = Readonly<{
  /** The chat's run state, or `undefined` before its machine exists. */
  runState: ChatSidebarState | undefined;
  /** The AI SDK chat status. */
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error';
  /** The transport's automatic retry attempt; `0` when none is under way. */
  retryAttempt: number;
}>;

/**
 * Whether a chat has live work, and the sentence for it (chat activity
 * indicator closeout R1).
 *
 * The run state is the authority. The chat status only covers the moments the
 * run machine has not caught up with yet: a submit before admission, or a
 * reload before the machine exists.
 *
 * @param facts - The chat's run and request facts.
 * @returns The cue, or `undefined` when nothing is running.
 * @public
 */
export const selectChatActivityCue = (facts: ChatActivityFacts): ChatActivityCue | undefined => {
  /* A finished run says nothing here: the revision card alone says "Saving revision" (§5.10, V5 B1). */
  if (facts.retryAttempt > 0 || facts.runState === 'reconnecting') {
    return { kind: 'reconnecting', sentence: 'Reconnecting…' };
  }
  switch (facts.runState) {
    case 'approval':
    case 'question': {
      return { kind: 'waiting', sentence: 'Planning next moves…' };
    }
    case 'queued':
    case 'working':
    case 'tool': {
      return { kind: 'working', sentence: 'Planning next moves…' };
    }
    default: {
      return facts.chatStatus === 'submitted' || facts.chatStatus === 'streaming'
        ? { kind: 'working', sentence: 'Planning next moves…' }
        : undefined;
    }
  }
};
