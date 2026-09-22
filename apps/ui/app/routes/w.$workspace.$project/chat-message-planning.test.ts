import { describe, expect, it } from 'vitest';
import type { MyMessagePart } from '@taucad/chat';
import { hasLiveSurface } from '#routes/w.$workspace.$project/chat-message-planning.js';

// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reducer-shaped parts for test
const parts = (...values: Array<Record<string, unknown>>): MyMessagePart[] => values as unknown as MyMessagePart[];
const tool = (state: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'dynamic-tool',
  toolName: 'read_file',
  toolCallId: 'call-1',
  input: {},
  state,
  ...extra,
});

describe('hasLiveSurface', () => {
  it.each([
    ['no parts', parts()],
    ['only a step boundary', parts({ type: 'step-start' })],
    ['concluded text', parts({ type: 'text', text: 'Done', state: 'done' })],
    ['a settled tool', parts(tool('output-available'))],
    ['a failed tool', parts(tool('output-error'))],
    ['a blank streaming thought', parts({ type: 'reasoning', text: '\n ', state: 'streaming' })],
    [
      'an ACP checkpoint thought behind a settled tool',
      parts({ type: 'reasoning', text: 'Plan', state: 'streaming' }, tool('output-available')),
    ],
    ['an answered approval', parts(tool('approval-responded'))],
    [
      'a resting ACP text checkpoint (resting block R2)',
      parts({
        type: 'text',
        text: 'The reference shows two broad finger scallops.',
        state: 'streaming',
        providerMetadata: { common: { streamState: 'checkpoint' } },
      }),
    ],
  ])('is false for %s', (_name, value) => {
    expect(hasLiveSurface(value)).toBe(false);
  });

  it.each([
    ['trailing streaming text', parts({ type: 'text', text: 'Drafting', state: 'streaming' })],
    [
      'text resumed after a checkpoint',
      parts({
        type: 'text',
        text: 'Drafting more',
        state: 'streaming',
        providerMetadata: { common: { streamState: 'live' } },
      }),
    ],
    [
      'a resting thought (its own spinner is the live surface)',
      parts({
        type: 'reasoning',
        text: 'Refining',
        state: 'streaming',
        providerMetadata: { common: { streamState: 'checkpoint' } },
      }),
    ],
    [
      'a trailing thought before usage data',
      parts({ type: 'reasoning', text: 'Checking', state: 'streaming' }, { type: 'data-usage', data: {} }),
    ],
    ['a tool receiving input', parts(tool('input-streaming'))],
    ['a running tool behind settled text', parts({ type: 'text', text: 'Ok', state: 'done' }, tool('input-available'))],
    ['preliminary tool output', parts(tool('output-available', { preliminary: true }))],
    ['a pending approval', parts(tool('approval-requested'))],
  ])('is true for %s', (_name, value) => {
    expect(hasLiveSurface(value)).toBe(true);
  });
});
