import { describe, expect, it } from 'vitest';
import type { AgentTimelineItem } from '@getpaseo/protocol/agent-types';
import {
  advancePaseoCursor,
  decidePaseoPromptSend,
  isPaseoFrameNew,
  projectPaseoItem,
  timelineCarriesPrompt,
} from '#lib/paseo/paseo-timeline.js';
import type { PaseoTimelinePage, PaseoToolCalls } from '#lib/paseo/paseo-timeline.js';

const page = (overrides: Partial<PaseoTimelinePage> = {}): PaseoTimelinePage => ({
  epoch: 'epoch_1',
  entries: [],
  ...overrides,
});

const entry = (seqEnd: number, item: AgentTimelineItem) => ({ seqEnd, item });

const context = () => {
  let next = 0;
  return {
    agentId: 'agent_1',
    createId: () => `id_${++next}`,
    openToolCalls: new Map() as PaseoToolCalls,
  };
};

describe('send exactly once', () => {
  it.each([
    ['pending', false, 'send'],
    ['pending', true, 'reconcile'],
    ['sent', false, 'reconcile'],
    ['approval', false, 'ambiguous'],
    ['sending', false, 'ambiguous'],
    ['sending', true, 'reconcile'],
  ] as const)('decides %s/%s as %s', (sendState, submitted, expected) => {
    expect(decidePaseoPromptSend(sendState, submitted)).toBe(expected);
  });

  it('finds this run own prompt by either message id', () => {
    expect(
      timelineCarriesPrompt(
        page({ entries: [entry(3, { type: 'user_message', text: 'hi', clientMessageId: 'run_1' })] }),
        'run_1',
      ),
    ).toBe(true);
    expect(
      timelineCarriesPrompt(
        page({ entries: [entry(3, { type: 'user_message', text: 'hi', messageId: 'run_1' })] }),
        'run_1',
      ),
    ).toBe(true);
    expect(
      timelineCarriesPrompt(
        page({ entries: [entry(3, { type: 'user_message', text: 'hi', messageId: 'other' })] }),
        'run_1',
      ),
    ).toBe(false);
  });
});

describe('cursor discipline', () => {
  it.each(['error', 'reset', 'staleCursor', 'gap'] as const)('refuses to replay past a %s page', (flag) => {
    const broken = page({ [flag]: flag === 'error' ? new Error('boom') : true });
    expect(() => advancePaseoCursor(broken, undefined)).toThrow('requires a reset');
  });

  it('accepts a healthy page whose error field is an explicit null', () => {
    // The wire sends `error: null`, not an absent field.
    const healthy = page({
      error: null,
      reset: false,
      staleCursor: false,
      gap: false,
      entries: [entry(1, { type: 'assistant_message', text: 'ok' })],
    });

    expect(advancePaseoCursor(healthy, undefined)).toHaveLength(1);
  });

  it('drops entries at or below the cursor in the same epoch', () => {
    const advanced = advancePaseoCursor(
      page({
        entries: [
          entry(1, { type: 'assistant_message', text: 'old' }),
          entry(2, { type: 'assistant_message', text: 'boundary' }),
          entry(3, { type: 'assistant_message', text: 'new' }),
        ],
      }),
      { epoch: 'epoch_1', seq: 2 },
    );

    expect(advanced.map(({ item }) => (item.type === 'assistant_message' ? item.text : ''))).toEqual(['new']);
    expect(advanced.at(-1)?.cursor).toEqual({ epoch: 'epoch_1', seq: 3 });
  });

  it('keeps every entry when the epoch rolled', () => {
    const advanced = advancePaseoCursor(
      page({ epoch: 'epoch_2', entries: [entry(1, { type: 'assistant_message', text: 'fresh' })] }),
      { epoch: 'epoch_1', seq: 9 },
    );

    expect(advanced).toHaveLength(1);
  });

  it('accepts a live frame only when it is ahead', () => {
    expect(isPaseoFrameNew({ epoch: 'epoch_1', seq: 3 }, { epoch: 'epoch_1', seq: 2 })).toBe(true);
    expect(isPaseoFrameNew({ epoch: 'epoch_1', seq: 2 }, { epoch: 'epoch_1', seq: 2 })).toBe(false);
    expect(isPaseoFrameNew({ epoch: 'epoch_2', seq: 1 }, { epoch: 'epoch_1', seq: 9 })).toBe(true);
    expect(isPaseoFrameNew({ seq: 1 }, undefined)).toBe(false);
    expect(isPaseoFrameNew({ epoch: 'epoch_1' }, undefined)).toBe(false);
  });
});

describe('thin projection', () => {
  it('marks every projected message as externally executed', () => {
    const [event] = projectPaseoItem({ type: 'assistant_message', text: 'done' }, context());

    expect(event).toMatchObject({
      type: 'message.appended',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        metadata: { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'agent_1' } },
      },
    });
  });

  it('pairs a running tool call with its later result on one tool-call id', () => {
    const shared = context();
    const running = projectPaseoItem(
      {
        type: 'tool_call',
        callId: 'call_a',
        name: 'shell',
        status: 'running',
        error: null,
        detail: { type: 'shell', command: 'ls' },
      },
      shared,
    );
    const completed = projectPaseoItem(
      {
        type: 'tool_call',
        callId: 'call_a',
        name: 'shell',
        status: 'completed',
        error: null,
        detail: { type: 'shell', command: 'ls', output: 'main.scad' },
      },
      shared,
    );

    expect(running).toHaveLength(1);
    expect(running[0]).toMatchObject({ message: { role: 'tool-input', toolName: 'shell' } });
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ message: { role: 'tool-output', toolName: 'shell', isError: false } });
    const inputCallId = (running[0] as { message: { toolCallId: string } }).message.toolCallId;
    expect((completed[0] as { message: { toolCallId: string } }).message.toolCallId).toBe(inputCallId);
  });

  it('emits both halves for a call first seen already terminal', () => {
    const events = projectPaseoItem(
      {
        type: 'tool_call',
        callId: 'call_b',
        name: 'write',
        status: 'failed',
        error: 'denied',
        detail: { type: 'write', filePath: 'a.scad' },
      },
      context(),
    );

    expect(events.map((event) => (event as { message: { role: string } }).message.role)).toEqual([
      'tool-input',
      'tool-output',
    ]);
    expect(events[1]).toMatchObject({ message: { isError: true, content: 'denied' } });
  });

  it.each([
    ['reasoning', { type: 'reasoning', text: 'thinking' }],
    ['todo', { type: 'todo', items: [] }],
    ['error', { type: 'error', message: 'boom' }],
    ['user_message', { type: 'user_message', text: 'hi' }],
    ['compaction', { type: 'compaction', status: 'completed' }],
  ] as Array<[string, AgentTimelineItem]>)('drops a %s item', (_name, item) => {
    expect(projectPaseoItem(item, context())).toEqual([]);
  });
});
