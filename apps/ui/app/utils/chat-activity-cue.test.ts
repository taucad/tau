import { describe, expect, it } from 'vitest';
import type { ChatSidebarState } from '#hooks/use-sidebar-status.js';
import { selectChatActivityCue } from '#utils/chat-activity-cue.js';
import type { ChatActivityFacts } from '#utils/chat-activity-cue.js';

describe('selectChatActivityCue — the bottom activity indicator (chat activity indicator closeout R1)', () => {
  const runStates: ReadonlyArray<ChatSidebarState | undefined> = [
    undefined,
    'idle',
    'queued',
    'working',
    'tool',
    'approval',
    'question',
    'reconnecting',
    'finishing',
    'done',
    'failed',
    'stopped',
  ];
  const chatStatuses: ReadonlyArray<ChatActivityFacts['chatStatus']> = ['submitted', 'streaming', 'ready', 'error'];
  const expected = (runState: ChatSidebarState | undefined, chatStatus: ChatActivityFacts['chatStatus']): string => {
    switch (runState) {
      case 'reconnecting': {
        return 'reconnecting:Reconnecting…';
      }
      case 'finishing': {
        return 'finishing:Finishing up…';
      }
      case 'approval':
      case 'question': {
        return 'waiting:Planning next moves…';
      }
      case 'queued':
      case 'working':
      case 'tool': {
        return 'working:Planning next moves…';
      }
      default: {
        return chatStatus === 'submitted' || chatStatus === 'streaming' ? 'working:Planning next moves…' : 'none';
      }
    }
  };

  it.each(runStates.flatMap((runState) => chatStatuses.map((chatStatus) => [runState, chatStatus] as const)))(
    'run %s with chat %s',
    (runState, chatStatus) => {
      const cue = selectChatActivityCue({ runState, chatStatus, retryAttempt: 0, retryMaxAttempts: 5 });
      expect(cue === undefined ? 'none' : `${cue.kind}:${cue.sentence}`).toBe(expected(runState, chatStatus));
    },
  );

  it('counts a transport retry over any run state', () => {
    expect(
      selectChatActivityCue({ runState: 'failed', chatStatus: 'error', retryAttempt: 2, retryMaxAttempts: 5 }),
    ).toEqual({ kind: 'reconnecting', sentence: 'Reconnecting… 2/5' });
  });
});
