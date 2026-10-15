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
  it('should use a generic thought label and distinguish writing from a resting checkpoint', () => {
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [{ type: 'reasoning', text: 'Earlier\n**Checking the wall thickness**', state: 'streaming' }],
      })?.sentence,
    ).toBe('Thinking…');
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

it('should use explicit commentary verbatim through checkpoints and subsequent reasoning', () => {
  const text = '**Literal progress**, not a parsed heading.\nSecond line.';
  const parts = [
    {
      type: 'text',
      text,
      state: 'done',
      providerMetadata: { common: { messagePhase: 'commentary', streamState: 'checkpoint' } },
    },
    { type: 'reasoning', text: '**Unrelated title**\nReasoning paragraph', state: 'streaming' },
  ] as const;
  expect(selectChatActivityCue({ runState: 'working', chatStatus: 'streaming', parts })?.sentence).toBe(text);
  expect(selectChatActivityCue({ runState: 'working', chatStatus: 'submitted', parts })?.sentence).toBe(
    'Planning next moves…',
  );
  for (const runState of ['done', 'failed', 'stopped'] as const) {
    expect(selectChatActivityCue({ runState, chatStatus: 'streaming', parts })).toBeUndefined();
  }
  expect(selectChatActivityCue({ runState: 'approval', chatStatus: 'streaming', parts })?.sentence).toBe(
    'Waiting for approval',
  );
  expect(selectChatActivityCue({ runState: 'reconnecting', chatStatus: 'streaming', parts })?.sentence).toBe(
    'Reconnecting…',
  );
});

it.each(['final_answer', 'partial_answer', 'future_phase', undefined])(
  'should not infer progress from %s or reuse earlier commentary',
  (phase) => {
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [
          {
            type: 'text',
            text: 'Old progress',
            state: 'done',
            providerMetadata: { common: { messagePhase: 'commentary' } },
          },
          {
            type: 'text',
            text: '**Checking geometry**',
            state: 'streaming',
            providerMetadata: { common: phase === undefined ? {} : { messagePhase: phase } },
          },
        ],
      })?.sentence,
    ).toBe('Writing response…');
  },
);

it('should let tool activity supersede commentary and not resurrect it when the tool settles', () => {
  for (const state of ['input-available', 'output-available'] as const) {
    expect(
      selectChatActivityCue({
        runState: 'working',
        chatStatus: 'streaming',
        parts: [
          {
            type: 'text',
            text: 'Old progress',
            state: 'done',
            providerMetadata: { common: { messagePhase: 'commentary' } },
          },
          {
            type: 'dynamic-tool',
            toolName: 'exec',
            toolCallId: 'cmd',
            ...(state === 'output-available' ? { state, output: 'done' } : { state }),
            input: {},
            toolMetadata: { tau: { kind: 'execute' } },
          },
        ],
      })?.sentence,
    ).toBe(state === 'input-available' ? 'Running commands' : 'Planning next moves…');
  }
});

it('should use a typed reasoning summary over older commentary without parsing thought formatting', () => {
  expect(
    selectChatActivityCue({
      runState: 'working',
      chatStatus: 'streaming',
      parts: [
        {
          type: 'text',
          text: 'Old commentary',
          state: 'done',
          providerMetadata: { common: { messagePhase: 'commentary' } },
        },
        {
          type: 'reasoning',
          text: '**Preparing supplemental CAD details**\n\n**Checking plot quality**',
          state: 'streaming',
          providerMetadata: { common: { reasoningSummary: '**Checking plot quality**' } },
        },
      ],
    })?.sentence,
  ).toBe('Checking plot quality');
});

it.each(['approval', 'question', 'reconnecting', 'done', 'failed', 'stopped'] as const)(
  'should not let a summary override authoritative %s state',
  (runState) => {
    const parts = [
      {
        type: 'reasoning',
        text: 'Details',
        state: 'streaming',
        providerMetadata: { common: { reasoningSummary: '**Checking plot quality**' } },
      },
    ] as const;
    expect(selectChatActivityCue({ runState, chatStatus: 'streaming', parts })).toEqual(
      selectChatActivityCue({ runState, chatStatus: 'streaming' }),
    );
  },
);

it('should parse the whole typed summary for display and never select a heading from it', () => {
  expect(
    selectChatActivityCue({
      runState: 'working',
      chatStatus: 'streaming',
      parts: [
        {
          type: 'reasoning',
          text: 'Not the summary',
          state: 'done',
          providerMetadata: {
            common: {
              reasoningSummary:
                '**Checking plot quality**\n\nValidate `main.cs` and [dimensions](https://example.com).',
            },
          },
        },
      ],
    })?.sentence,
  ).toBe('Checking plot quality Validate main.cs and dimensions.');
});

it('should prefer active tools and not resurrect summaries after a later tool or answer', () => {
  const summary = {
    type: 'reasoning',
    text: 'Details',
    state: 'streaming',
    providerMetadata: { common: { reasoningSummary: '**Checking plot quality**' } },
  } as const;
  const tool = {
    type: 'dynamic-tool',
    toolName: 'exec',
    toolCallId: 'exec',
    state: 'input-available',
    input: {},
    toolMetadata: { tau: { kind: 'execute' } },
  } as const;
  expect(selectChatActivityCue({ runState: 'tool', chatStatus: 'streaming', parts: [tool, summary] })?.sentence).toBe(
    'Running commands',
  );
  expect(
    selectChatActivityCue({
      runState: 'working',
      chatStatus: 'streaming',
      parts: [summary, { ...tool, state: 'output-available', output: 'done' }],
    })?.sentence,
  ).toBe('Planning next moves…');
  expect(
    selectChatActivityCue({
      runState: 'working',
      chatStatus: 'streaming',
      parts: [summary, { type: 'text', text: 'Answer', state: 'streaming' }],
    })?.sentence,
  ).toBe('Writing response…');
});
