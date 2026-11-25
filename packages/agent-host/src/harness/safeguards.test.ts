import { normalizeContext } from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import { createAgentSafeguards, resolveSafeguardThresholds } from '#harness/safeguards.js';
import { safeguardPatternOf } from '#harness/safeguard-pattern.js';
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

const repeatedCalls = (count: number, isError = false, toolName = 'read_file'): AgentMessage[] =>
  Array.from({ length: count }, (_, index): AgentMessage[] => [
    {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: `call-${index}`,
          name: toolName,
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
      toolName,
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
    const stream = await safeguards.wrapStreamFn(base)(stubModel, normalizeContext({ messages: [] }));

    expect(base).not.toHaveBeenCalled();
    const result = await stream.result();
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.stringify(result.content)).toContain('Please review what was attempted');
  });

  describe('a call repeated unchanged (C-5)', () => {
    const run = async (messages: AgentMessage[]) => {
      const recorded: SafeguardRecord[] = [];
      const safeguards = createAgentSafeguards({
        record: async (entry) => {
          recorded.push(entry);
        },
        hash: async (input) => `hash:${input}`,
      });
      /* The context as the loop grows: one more identical call each step. */
      for (let count = 1; count <= messages.length / 2; count++) {
        // oxlint-disable-next-line no-await-in-loop -- each step of the loop sees the context the one before left.
        await safeguards.transformContext(messages.slice(0, count * 2));
      }
      const base = vi.fn() as unknown as StreamFn;
      await safeguards.wrapStreamFn(base)(stubModel, normalizeContext({ messages: [] }));
      return { recorded, asked: vi.mocked(base).mock.calls.length > 0 };
    };

    it('should remind at five and end the run at ten', async () => {
      const { recorded, asked } = await run(repeatedCalls(10));

      expect(recorded.map((entry) => [entry.kind, entry.pattern])).toEqual([
        ['nudge', 'identical_call'],
        ['terminate', 'identical_call'],
      ]);
      expect(recorded[1]?.kind === 'terminate' ? recorded[1].reason : '').toContain('10 times in a row');
      expect(asked).toBe(false);
    });

    it('should record the end as an identical call, as the ledger reads it', async () => {
      const { recorded } = await run(repeatedCalls(10));

      expect(recorded.map((entry) => safeguardPatternOf(entry.signature))).toEqual([
        'identical_call',
        'identical_call',
      ]);
    });

    it('should end a run only after the reminder its end names, whatever counts are set', () => {
      expect(resolveSafeguardThresholds({ identicalCall: 12 })).toMatchObject({
        identicalCall: 12,
        identicalCallTerminate: 24,
      });
      expect(resolveSafeguardThresholds({ identicalErrorNudge: 4 })).toMatchObject({ identicalErrorTerminate: 8 });
      expect(resolveSafeguardThresholds()).toMatchObject({ identicalCallTerminate: 10, identicalErrorTerminate: 6 });
      expect(() => resolveSafeguardThresholds({ identicalCall: 12, identicalCallTerminate: 10 })).toThrow(RangeError);
      expect(() => resolveSafeguardThresholds({ identicalErrorNudge: 6, identicalErrorTerminate: 6 })).toThrow(
        RangeError,
      );
    });

    it('should not end a run at nine identical calls', async () => {
      const { recorded, asked } = await run(repeatedCalls(9));

      expect(recorded.map((entry) => entry.kind)).toEqual(['nudge']);
      expect(asked).toBe(true);
    });

    it.each(['check_job', 'get_machine', 'list_machines', 'shell'])(
      'should let the agent poll %s without a reminder or an end',
      async (toolName) => {
        const { recorded, asked } = await run(repeatedCalls(20, false, toolName));

        expect(recorded).toEqual([]);
        expect(asked).toBe(true);
      },
    );

    it('should still end a polling tool that fails identically', async () => {
      const { recorded } = await run(repeatedCalls(6, true, 'check_job'));

      expect(recorded.at(-1)).toMatchObject({ kind: 'terminate', pattern: 'identical_error' });
    });
  });

  describe('the window the detectors count over', () => {
    const person = (text: string): AgentMessage => ({ role: 'user', content: [{ type: 'text', text }], timestamp: 0 });
    const isPersonsMessage = (message: AgentMessage): boolean =>
      message.role === 'user' && !JSON.stringify(message.content).includes('<system-reminder>');

    it('should let the model answer a new message after an earlier turn was stopped for repeating itself', async () => {
      const recorded: SafeguardRecord[] = [];
      const safeguards = createAgentSafeguards({
        record: async (entry) => {
          recorded.push(entry);
        },
        hash: async (input) => `hash:${input}`,
        isPersonsMessage,
      });
      const base = vi.fn() as unknown as StreamFn;

      await safeguards.transformContext([
        person('Export the part.'),
        ...repeatedCalls(6, true),
        person('Never mind the export. What is 2 + 2?'),
      ]);
      await safeguards.wrapStreamFn(base)(stubModel, normalizeContext({ messages: [] }));

      expect(recorded).toEqual([]);
      expect(base).toHaveBeenCalledTimes(1);
    });

    it('should not count calls made before the person last spoke toward a reminder', async () => {
      const record = vi.fn(async () => undefined);
      const safeguards = createAgentSafeguards({ record, hash: async (input) => `hash:${input}`, isPersonsMessage });

      const messages = [
        person('Read it.'),
        ...repeatedCalls(4),
        person('Read it again, I changed it.'),
        ...repeatedCalls(1),
      ];
      const result = await safeguards.transformContext(messages);

      expect(result).toBe(messages);
      expect(record).not.toHaveBeenCalled();
    });

    it("should keep counting across the safeguards' own reminder, which is not the person speaking", async () => {
      const recorded: SafeguardRecord[] = [];
      const safeguards = createAgentSafeguards({
        record: async (entry) => {
          recorded.push(entry);
        },
        hash: async (input) => `hash:${input}`,
        isPersonsMessage,
      });
      const base = vi.fn() as unknown as StreamFn;
      const reminder = person('<system-reminder>\nStop retrying.\n</system-reminder>');

      await safeguards.transformContext([
        person('Export the part.'),
        ...repeatedCalls(3, true),
        reminder,
        ...repeatedCalls(3, true),
      ]);
      await safeguards.wrapStreamFn(base)(stubModel, normalizeContext({ messages: [] }));

      expect(recorded.map((entry) => entry.kind)).toEqual(['terminate']);
      expect(base).not.toHaveBeenCalled();
    });
  });

  /* Slice (a): a grep that could not search a pending file has not found nothing. */
  it('does not call a grep empty when it names files it could not search', async () => {
    const grepCalls = (pendingFiles: readonly string[]): AgentMessage[] =>
      Array.from({ length: 3 }, (_, index): AgentMessage[] => [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: `grep-${index}`, name: 'grep', arguments: { pattern: 'marker' } }],
          api: 'openai-responses',
          provider: 'stub',
          model: 'stub',
          usage,
          stopReason: 'toolUse',
          timestamp: index,
        },
        {
          role: 'toolResult',
          toolCallId: `grep-${index}`,
          toolName: 'grep',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                matches: [],
                totalMatches: 0,
                appliedHeadLimit: 50,
                appliedOffset: 0,
                ...(pendingFiles.length === 0 ? {} : { pendingFiles }),
              }),
            },
          ],
          isError: false,
          timestamp: index,
        },
      ]).flat();
    const patternsFor = async (messages: AgentMessage[]): Promise<string[]> => {
      const recorded: SafeguardRecord[] = [];
      const safeguards = createAgentSafeguards({
        record: async (entry: SafeguardRecord) => {
          recorded.push(entry);
        },
        recordOutcome: async () => undefined,
        hash: async (input) => `hash:${input}`,
      });
      await safeguards.transformContext(messages);
      return recorded.flatMap((entry) => (entry.kind === 'nudge' ? [entry.pattern] : []));
    };

    expect(await patternsFor(grepCalls([]))).toContain('empty_result');
    expect(await patternsFor(grepCalls(['models/part.step']))).not.toContain('empty_result');
  });
});
