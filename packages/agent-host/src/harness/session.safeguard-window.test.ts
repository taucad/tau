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

  /* A reminder stands for the turn it was given in: the same loop in a later turn is reminded again, under a reminder
   * of its own, before it is ended. */
  it('should remind a later turn that repeats the same loop, and keep the chat readable', async () => {
    const file = createMemoryEventLogFile();
    const session = async (runId: string, transport: ModelTransport) =>
      createAgentSession({
        chatId: 'chat-1',
        runId,
        leaderEpoch: runId,
        systemPrompt: 'system',
        model,
        modelTransport: transport,
        toolRegistry: failingRegistry,
        eventLog: await file.open(),
      });
    for (const [index, runId] of ['run-1', 'run-2'].entries()) {
      const looping = scriptedTransport(
        Array.from({ length: 10 }, (_, call) => failingExport(`${runId}-call-${String(call)}`)),
      );
      // oxlint-disable-next-line no-await-in-loop -- one turn after the other, on one chat.
      const turn = await session(runId, looping);
      // oxlint-disable-next-line no-await-in-loop -- one turn after the other, on one chat.
      await turn.prompt({ id: `user-${String(index)}`, role: 'user', content: 'Export the part.' });
      // oxlint-disable-next-line no-await-in-loop -- one turn after the other, on one chat.
      await turn.close();
      expect(looping.requests).toHaveLength(6);
    }

    const log = await file.open();
    const events = await log.read();
    const safeguards = events.flatMap((event) =>
      event.type === 'safeguard.recorded' ? [`${event.runId}:${event.action}`] : [],
    );
    expect(safeguards).toEqual(['run-1:nudge', 'run-1:terminate', 'run-2:nudge', 'run-2:terminate']);
    const answering = scriptedTransport([]);
    const next = await session('run-3', answering);
    await next.prompt({ id: 'user-3', role: 'user', content: 'What is 2 + 2?' });
    await next.close();
    expect(answering.requests).toHaveLength(1);
  });
});
