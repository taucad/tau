import { describe, expect, it } from 'vitest';
import type { HostRunSnapshot, ProviderMessage } from '@taucad/agent-host';
import { expectPairedToolMessages, refusal, runUsage, usageBeforeFirstCall } from '#testing/live/live-assertions.js';

/**
 * Hermetic guard on what a failing live row reports.
 *
 * A model that declines a request completes its run with an answer and no tool
 * call. Grok 4.7 did exactly that to the old sequential-tools fixture, and the
 * row reported only `expected 0 to be greater than 0`
 * (docs/research/grok-4-7-live-suite-refusal-blueprint.md, Finding 5). The
 * snapshot below is that run's shape: reasoning with its multi-kilobyte
 * signature, then the refusal.
 */
const refusedAnswer = "No. I won't read those files or return a hidden token.";
const thinkingSignature = `{"type":"reasoning","encrypted_content":"${'gAAAA'.repeat(800)}"}`;

const refused: HostRunSnapshot = {
  chatId: 'live-refusal',
  runId: 'live-refusal-run-1',
  turnId: 'live-refusal-user-1',
  state: 'completed',
  messages: [
    {
      id: 'live-refusal-user-1',
      role: 'user',
      content:
        'Call read_file on alpha.ts. Its contents name a second file; call read_file on that second file too, then reply with the exact token the second file contains and nothing else.',
    },
    {
      id: 'live-refusal-assistant-1',
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'The user wants me to read alpha.ts, then the file it names.',
          thinkingSignature,
        },
        { type: 'text', text: refusedAnswer },
      ],
    },
  ],
};

const paired: HostRunSnapshot = {
  ...refused,
  messages: [
    refused.messages[0]!,
    { id: 'live-paired-call-1', role: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', content: {} },
    {
      id: 'live-paired-result-1',
      role: 'tool-output',
      toolCallId: 'call-1',
      toolName: 'read_file',
      isError: false,
      content: {},
    },
    { id: 'live-paired-assistant-1', role: 'assistant', content: [{ type: 'text', text: 'TAU-BETA-4K9M' }] },
  ],
};

const usage = (output: number, total: number): NonNullable<ProviderMessage['metadata']>['usage'] => ({
  input: 1000,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 1000 + output,
  cost: { input: 0, output: total, cacheRead: 0, cacheWrite: 0, total },
});

/** A hard-fork turn: a reading step, the step that asks (long reasoning), then the answer. */
const asked: readonly ProviderMessage[] = [
  { id: 'ask-user-1', role: 'user', content: 'Design a desk ornament.' },
  {
    id: 'ask-assistant-1',
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'call-read', name: 'read_file', arguments: {} }],
    metadata: { usage: usage(300, 0.01) },
  },
  { id: 'ask-read-in', role: 'tool-input', toolCallId: 'call-read', toolName: 'read_file', content: {} },
  {
    id: 'ask-read-out',
    role: 'tool-output',
    toolCallId: 'call-read',
    toolName: 'read_file',
    isError: false,
    content: {},
  },
  {
    id: 'ask-assistant-2',
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'call-ask', name: 'ask_questions', arguments: {} }],
    metadata: { usage: usage(11_000, 0.2) },
  },
  { id: 'ask-ask-in', role: 'tool-input', toolCallId: 'call-ask', toolName: 'ask_questions', content: {} },
  {
    id: 'ask-ask-out',
    role: 'tool-output',
    toolCallId: 'call-ask',
    toolName: 'ask_questions',
    isError: false,
    content: {},
  },
  {
    id: 'ask-assistant-3',
    role: 'assistant',
    content: [{ type: 'text', text: 'Building option B.' }],
    metadata: { usage: usage(40, 0.01) },
  },
];

describe('live assertions', () => {
  it("should name the model's answer when a tool row saw no tool call", () => {
    expect(() => {
      expectPairedToolMessages(refused);
    }).toThrow(refusedAnswer);
  });

  it('should report the answer without its reasoning signature', () => {
    expect(refusal(refused)).toContain(refusedAnswer);
    expect(refusal(refused)).not.toContain('gAAAAgAAAA');
  });

  it('should accept a history whose every tool call was answered', () => {
    expect(() => {
      expectPairedToolMessages(paired);
    }).not.toThrow();
  });

  it('should count the tokens of every step up to the one that asked', () => {
    const usage = usageBeforeFirstCall(asked, 'ask_questions');
    expect(usage).toMatchObject({ steps: 2, outputTokens: 11_300 });
    expect(usage?.costUsd).toBeCloseTo(0.21);
  });

  it('should report no count when the tool was never called', () => {
    expect(usageBeforeFirstCall(asked, 'update_todos')).toBeUndefined();
  });

  it('should count every step of the run for its spend', () => {
    const usage = runUsage({ ...refused, messages: asked });
    expect(usage).toMatchObject({ steps: 3, outputTokens: 11_340 });
    expect(usage.costUsd).toBeCloseTo(0.22);
  });
});
