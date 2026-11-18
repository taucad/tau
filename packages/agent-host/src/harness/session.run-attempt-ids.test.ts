/**
 * Q13 (Langfuse go-live, LI2/LI3): every model call a run makes names that run in its gateway attempt id, whether or
 * not the transport is funded. The API reads `<runId>:<attempt>:<n>` as a call of run `<runId>` and files it under
 * that run's trace; any other id is a direct call with a trace of its own. Before this, only a funded transport
 * (`TAU_CLOUD_ENABLED` builds) named the run, so a desktop build split every model call into its own trace.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryEventLog } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const toolRegistry: ToolRegistry = {
  list: () => [
    {
      name: 'read_file',
      description: 'Read one project file.',
      inputSchema: { type: 'object', properties: { targetFile: { type: 'string' } }, additionalProperties: false },
    },
  ],
  invoke: async () => ({ content: { content: 'module nut() {}' }, isError: false }),
};

/** An unfunded transport answering `toolSteps` tool calls, then text; every request is recorded. */
const unfundedTransport = (requests: ModelStreamRequest[], toolSteps: number): ModelTransport => {
  let generations = 0;
  return {
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request);
      generations += 1;
      if (generations <= toolSteps) {
        yield {
          type: 'tool-input',
          toolCallId: `call-${String(generations)}`,
          toolName: 'read_file',
          input: { targetFile: 'main.scad' },
        };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
};

/* The API's reading of a host attempt key (`hostAttemptKey` in api-agent-observability). */
const runOfAttempt = (attemptId: string): string | undefined => /^(.+):\d+:\d+$/u.exec(attemptId)?.[1];

describe('run-scoped attempt ids on an unfunded transport', () => {
  it('should name the run in every model call’s attempt id, each id distinct', async () => {
    const requests: ModelStreamRequest[] = [];
    const session = await createAgentSession({
      chatId: 'chat-q13',
      runId: 'run-q13',
      leaderEpoch: 'epoch-q13',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
      modelTransport: unfundedTransport(requests, 2),
      toolRegistry,
      eventLog: await createMemoryEventLog(),
    });
    const outcome = await session.prompt({ id: 'u-1', role: 'user', content: 'make a nut' });
    await session.close();

    expect(outcome.outcome).toBe('completed');
    const attemptIds = requests.map((request) => request.attemptId);
    expect(attemptIds).toHaveLength(3);
    expect(attemptIds.map((attemptId) => runOfAttempt(attemptId))).toEqual(['run-q13', 'run-q13', 'run-q13']);
    expect(attemptIds.every((attemptId) => attemptId.startsWith('run-q13:1:'))).toBe(true);
    expect(new Set(attemptIds).size).toBe(3);
  });
});
