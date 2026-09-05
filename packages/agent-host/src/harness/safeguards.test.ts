import { describe, expect, it, vi } from 'vitest';
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import { createAgentSafeguards } from '#harness/safeguards.js';
import type { SafeguardRecord } from '#harness/safeguards.js';
import { stubModel } from '#harness/harness.fixture.js';

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const repeatedCalls = (count: number, isError = false): AgentMessage[] =>
  Array.from({ length: count }, (_, index): AgentMessage[] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: `call-${index}`,
          name: 'read_file',
          arguments: { targetFile: 'main.ts' },
        },
      ],
      api: 'openai-responses',
      provider: 'stub',
      model: 'stub',
      usage,
      stopReason: 'toolUse',
      timestamp: index,
    },
    {
      role: 'toolResult',
      toolCallId: `call-${index}`,
      toolName: 'read_file',
      content: [{ type: 'text', text: isError ? '{"errorCode":"E","message":"bad"}' : 'ok' }],
      isError,
      timestamp: index,
    },
  ]).flat();

describe('AgentSafeguards', () => {
  it('fires one deterministic signature and deduplicates the same nudge', async () => {
    const recorded: SafeguardRecord[] = [];
    const record = vi.fn(async (entry: SafeguardRecord) => {
      recorded.push(entry);
    });
    const recordOutcome = vi.fn(async () => undefined);
    const safeguards = createAgentSafeguards({
      record,
      recordOutcome,
      hash: async (input) => `hash:${input}`,
    });
    const messages = repeatedCalls(5);

    const first = await safeguards.transformContext(messages);
    const second = await safeguards.transformContext(messages);

    expect(first).toHaveLength(messages.length + 1);
    expect(second).toEqual(messages);
    expect(record).toHaveBeenCalledTimes(1);
    expect(recorded[0]).toMatchObject({
      kind: 'nudge',
      pattern: 'identical_call',
    });
    expect(recorded[0]?.kind === 'nudge' ? recorded[0].reminder : '').toContain(
      'The result will not change between calls.',
    );
    expect(recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'identical_call', helped: false }));
    expect(safeguards.firedSignatures.size).toBe(1);
  });

  it('short-circuits the provider on the identical-error termination threshold', async () => {
    const safeguards = createAgentSafeguards({
      record: async () => undefined,
      hash: async (input) => `hash:${input}`,
    });
    await safeguards.transformContext(repeatedCalls(6, true));
    const base = vi.fn() as unknown as StreamFn;
    const stream = await safeguards.wrapStreamFn(base)(stubModel, { messages: [] });

    expect(base).not.toHaveBeenCalled();
    const result = await stream.result();
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.stringify(result.content)).toContain('Please review what was attempted');
  });
});
