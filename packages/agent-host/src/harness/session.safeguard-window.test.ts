/**
 * The safeguards count what the agent did since the person last spoke.
 *
 * A run that repeats one failing call is ended by the identical-error safeguard. The results of that run stay in the
 * chat's history, and the detectors used to read the whole history, so the six old failures were still the tail when
 * the person sent their next message: every later turn was ended again before the model was asked anything, and the
 * chat could not take another turn (launch audit, C-2).
 */
import { describe, expect, it } from 'vitest';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

type Step = (request: ModelStreamRequest) => AsyncGenerator<ModelStreamEvent>;

/** A transport that plays its steps in order, then answers in plain text. */
const scriptedTransport = (steps: readonly Step[]): ModelTransport & { readonly requests: ModelStreamRequest[] } => {
  const queue = [...steps];
  const requests: ModelStreamRequest[] = [];
  return {
    funding: { type: 'unfunded' },
    requests,
    async *stream(request) {
      requests.push(request);
      const step = queue.shift();
      if (step) {
        yield* step(request);
        return;
      }
      yield { type: 'text-delta', text: 'Four.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
};

const failingExport = (id: string): Step =>
  async function* () {
    yield {
      type: 'tool-input',
      toolCallId: id,
      toolName: 'export_model',
      input: { targetFile: 'main.ts', to: 'step' },
    };
    yield { type: 'completed', stopReason: 'toolUse' };
  };

const failingRegistry: ToolRegistry = {
  list: () => [
    {
      name: 'export_model',
      description: 'Export the model.',
      inputSchema: { type: 'object', properties: { targetFile: { type: 'string' }, to: { type: 'string' } } },
    },
  ],
  invoke: async () => ({ content: { errorCode: 'KERNEL_ERROR', message: 'export failed' }, isError: true }),
};

const model = { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' } as const;

describe('safeguards across turns', () => {
  it('should ask the model about a new message after an earlier turn was stopped for repeating itself', async () => {
    const file = createMemoryEventLogFile();
    const looping = scriptedTransport(Array.from({ length: 10 }, (_, index) => failingExport(`call-${String(index)}`)));
    const stopped = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'system',
      model,
      modelTransport: looping,
      toolRegistry: failingRegistry,
      eventLog: await file.open(),
    });
    await stopped.prompt({ id: 'user-1', role: 'user', content: 'Export the part.' });
    await stopped.close();
    /* The safeguard ended the first run at its sixth identical failure. */
    expect(looping.requests).toHaveLength(6);

    const answering = scriptedTransport([]);
    const next = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-2',
      leaderEpoch: 'epoch-2',
      systemPrompt: 'system',
      model,
      modelTransport: answering,
      toolRegistry: failingRegistry,
      eventLog: await file.open(),
    });
    await next.prompt({ id: 'user-2', role: 'user', content: 'Never mind the export. What is 2 + 2?' });
    const snapshot = await next.snapshot();
    await next.close();

    expect(answering.requests).toHaveLength(1);
    expect(JSON.stringify(snapshot.messages.findLast((message) => message.role === 'assistant')?.content)).toContain(
      'Four.',
    );
  });
});
