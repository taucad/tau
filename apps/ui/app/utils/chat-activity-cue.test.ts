import { describe, expect, it } from 'vitest';
import { selectChatActivityCue } from '#utils/chat-activity-cue.js';

describe('selectChatActivityCue', () => {
  it.each(['done', 'failed', 'stopped'] as const)(
    'should honor terminal %s despite stale streaming state',
    (runState) => {
      expect(selectChatActivityCue({ runState, chatStatus: 'streaming' })).toBeUndefined();
    },
  );
  it.each([
    ['queued', 'Queued…'],
    ['working', 'Planning next moves…'],
    ['tool', 'Planning next moves…'],
    ['approval', 'Waiting for approval'],
    ['question', 'Waiting for your answer'],
    ['reconnecting', 'Reconnecting…'],
  ] as const)('should describe host state %s while the SDK is ready', (runState, sentence) => {
    expect(selectChatActivityCue({ runState, chatStatus: 'ready' })?.sentence).toBe(sentence);
  });
  it('should cover admission before the run exists', () => {
    expect(selectChatActivityCue({ runState: undefined, chatStatus: 'submitted' })?.sentence).toBe(
      'Planning next moves…',
    );
    expect(selectChatActivityCue({ runState: undefined, chatStatus: 'ready' })).toBeUndefined();
  });
  it('should show a newly submitted request before the previous terminal host state catches up', () => {
    expect(selectChatActivityCue({ runState: 'done', chatStatus: 'submitted' })?.sentence).toBe('Planning next moves…');
  });

  it('should name the running command over an earlier open thought', () => {
    expect(
      selectChatActivityCue({
        runState: 'tool',
        chatStatus: 'streaming',
        parts: [
          { type: 'reasoning', text: 'Old thought', state: 'streaming' },
          {
            type: 'dynamic-tool',
            toolName: 'exec',
            toolCallId: 'cmd',
            state: 'input-available',
            input: {},
            toolMetadata: { tau: { kind: 'execute' } },
          },
        ],
      })?.sentence,
    ).toBe('Running commands');
  });
  it('should stop describing a settled tool as running', () => {
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'exec',
            toolCallId: 'cmd',
            state: 'output-available',
            input: {},
            output: 'done',
          },
        ],
      })?.sentence,
    ).toBe('Planning next moves…');
  });
  it('should show the latest thought and distinguish writing from a resting checkpoint', () => {
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [{ type: 'reasoning', text: 'Earlier\n**Checking the wall thickness**', state: 'streaming' }],
      })?.sentence,
    ).toBe('Checking the wall thickness');
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [{ type: 'text', text: 'Result', state: 'streaming' }],
      })?.sentence,
    ).toBe('Writing response…');
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [
          {
            type: 'text',
            text: 'Result',
            state: 'streaming',
            providerMetadata: { common: { streamState: 'checkpoint' } },
          },
        ],
      })?.sentence,
    ).toBe('Planning next moves…');
  });
});
