import { describe, expect, it } from 'vitest';
import type { HostToolInvocation, ModelTransport, ToolRegistry } from '#waist/ports.js';
import { createMemoryEventLog } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import { createToolResultBatchBudget, toolResultBatchBudget } from '#harness/tool-result-budget.js';

/*
 * Regression review R4: the server agent plane capped what one batch of tool results put into context at 200,000
 * characters. The session hands each call its batch's budget, which a new model request resets.
 */

describe('createToolResultBatchBudget', () => {
  it('should admit results until the batch total would pass the limit', () => {
    const batch = createToolResultBatchBudget(100);

    expect(batch.budget.admit(60)).toBe(true);
    expect(batch.budget.admit(50)).toBe(false);
    expect(batch.budget.admit(40)).toBe(true);
    expect(batch.budget.admit(1)).toBe(false);
  });

  it('should count charged previews against the batch', () => {
    const batch = createToolResultBatchBudget(100);

    batch.budget.charge(90);

    expect(batch.budget.admit(20)).toBe(false);
    expect(batch.budget.admit(10)).toBe(true);
  });

  it('should start each batch empty', () => {
    const batch = createToolResultBatchBudget(100);
    batch.budget.charge(100);

    batch.reset();

    expect(batch.budget.admit(100)).toBe(true);
  });

  it('should default to the server agent plane budget', () => {
    expect(toolResultBatchBudget).toBe(200_000);
  });
});

describe('the session batch budget', () => {
  it('should give calls of one response a shared budget and the next response a fresh one', async () => {
    const seen: Array<{ id: string; admitted: boolean }> = [];
    const registry: ToolRegistry = {
      list: () => [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
      invoke: async (invocation: HostToolInvocation) => {
        seen.push({ id: invocation.toolCallId, admitted: invocation.resultBudget?.admit(150_000) ?? true });
        return { content: 'ok', isError: false };
      },
    };
    let calls = 0;
    const stream: ModelTransport['stream'] = async function* () {
      calls++;
      if (calls === 1) {
        yield { type: 'tool-input', toolCallId: 'a', toolName: 'read_file', input: {} };
        yield { type: 'tool-input', toolCallId: 'b', toolName: 'read_file', input: {} };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      if (calls === 2) {
        yield { type: 'tool-input', toolCallId: 'c', toolName: 'read_file', input: {} };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'completed', stopReason: 'stop' };
    };
    const session = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'Build CAD models.',
      model: { id: 'model-1', contextWindow: 400_000, maxTokens: 8192 },
      modelTransport: { funding: { type: 'unfunded' }, stream },
      toolRegistry: registry,
      eventLog: await createMemoryEventLog(),
    });

    await expect(session.prompt({ id: 'user-1', role: 'user', content: 'Read.' })).resolves.toEqual({
      outcome: 'completed',
    });

    const admitted = (id: string): boolean[] => seen.filter((call) => call.id === id).map((call) => call.admitted);
    expect(seen).toHaveLength(3);
    /* 150,000 + 150,000 overruns one batch, so exactly one of the parallel pair is refused; the next batch is fresh. */
    expect([...admitted('a'), ...admitted('b')].filter(Boolean)).toHaveLength(1);
    expect(admitted('c')).toEqual([true]);
  });
});
