import type { ChatSidebarState } from '#hooks/use-sidebar-status.js';

/**
 * What the chat history's bottom activity indicator may say.
 *
 * `waiting` is a paused or approval-gated run: the person's own control owns
 * that state, so the indicator speaks only once their answer is in.
 *
 * @public
 */
export type ChatActivityCue = Readonly<{
  kind: 'working' | 'waiting' | 'reconnecting' | 'finishing';
  sentence: string;
}>;

/** The request facts the cue reads beside the run state. @public */
export type ChatActivityFacts = Readonly<{
  /** The chat's run state, or `undefined` before its machine exists. */
  runState: ChatSidebarState | undefined;
  /** The AI SDK chat status. */
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error';
  retryAttempt: number;
  retryMaxAttempts: number;
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
  if (facts.retryAttempt > 0) {
    return {
      kind: 'reconnecting',
      sentence: `Reconnecting… ${String(facts.retryAttempt)}/${String(facts.retryMaxAttempts)}`,
    };
  }
  switch (facts.runState) {
    case 'reconnecting': {
      return { kind: 'reconnecting', sentence: 'Reconnecting…' };
    }
    case 'finishing': {
      return { kind: 'finishing', sentence: 'Finishing up…' };
    }
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
