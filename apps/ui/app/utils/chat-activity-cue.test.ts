import { describe, expect, it } from 'vitest';
import type { ChatSidebarState } from '#types/chat-sidebar.types.js';
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
      const cue = selectChatActivityCue({ runState, chatStatus });
      expect(cue === undefined ? 'none' : `${cue.kind}:${cue.sentence}`).toBe(expected(runState, chatStatus));
    },
  );

  /* V5 B3: the attempt count ("n/5") goes; only host attachment can say reconnecting. */
  it('says Reconnecting without an attempt count for a reconnecting run', () => {
    expect(selectChatActivityCue({ runState: 'reconnecting', chatStatus: 'error' })).toEqual({
      kind: 'reconnecting',
      sentence: 'Reconnecting…',
    });
  });
});
