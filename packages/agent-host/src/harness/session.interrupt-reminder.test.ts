import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';

/* Regression review R3: a new prompt after Stop must carry the interrupt reminder, as a resume does. */

class RecordingTransport implements ModelTransport {
  public readonly funding = { type: 'unfunded' } as const;
  public readonly requests: ModelStreamRequest[] = [];

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    yield { type: 'text-delta', text: 'ok' };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

const stoppedRun: readonly ProviderMessage[] = [
  { id: 'user-1', role: 'user', content: 'Rewrite main.ts' },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: [
      { type: 'toolCall', id: 'call-read', name: 'read_file', arguments: { targetFile: 'main.ts' } },
      { type: 'toolCall', id: 'call-edit', name: 'edit_file', arguments: { targetFile: 'main.ts' } },
    ],
    metadata: { stopReason: 'toolUse' },
  },
  {
    id: 'input-read',
    role: 'tool-input',
    toolCallId: 'call-read',
    toolName: 'read_file',
    content: { targetFile: 'main.ts' },
  },
  {
    id: 'input-edit',
    role: 'tool-input',
    toolCallId: 'call-edit',
    toolName: 'edit_file',
    content: { targetFile: 'main.ts' },
  },
  {
    id: 'output-read',
    role: 'tool-output',
    toolCallId: 'call-read',
    toolName: 'read_file',
    content: { content: 'export const main = 1;' },
    isError: false,
  },
  {
    id: 'output-edit',
    role: 'tool-output',
    toolCallId: 'call-edit',
    toolName: 'edit_file',
    content: { errorCode: 'USER_INTERRUPTED', message: 'The user stopped the turn.' },
    isError: true,
  },
];

const seed = async (file: ReturnType<typeof createMemoryEventLogFile>, messages: readonly ProviderMessage[]) => {
  const log = await file.open();
  for (const [sequence, message] of messages.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- the log appends in order.
    await log.append({
      version: 1,
      leaderEpoch: 'seed-epoch',
      sequence,
      recordedAt: '2026-11-08T00:00:00.000Z',
      runId: 'run-stopped',
      type: 'message.appended',
      message,
    });
  }
  await log.close();
};

const promptAfter = async (messages: readonly ProviderMessage[]) => {
  const file = createMemoryEventLogFile();
  await seed(file, messages);
  const transport = new RecordingTransport();
  const session = await createAgentSession({
    chatId: 'chat-1',
    runId: 'run-next',
    leaderEpoch: 'epoch-next',
    systemPrompt: 'system',
    model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
    modelTransport: transport,
    toolRegistry: { list: () => [], invoke: vi.fn() },
    eventLog: await file.open(),
  });
  await session.prompt({ id: 'user-2', role: 'user', content: 'Try again, smaller change.' });
  await session.close();
  const log = await file.open();
  const events = await log.read();
  await log.close();
  return { transport, events };
};

const isReminder = (message: { readonly id?: string }): boolean =>
  typeof message.id === 'string' && message.id.startsWith('tau:interrupt-recovery:');

describe('interrupt reminder on a new prompt after Stop (R3)', () => {
  it('should send the reminder after the stopped history and before the new prompt', async () => {
    const { transport, events } = await promptAfter(stoppedRun);

    const sent = transport.requests[0]?.messages ?? [];
    const reminderIndex = sent.findIndex((message) => isReminder(message));
    const promptIndex = sent.findIndex((message) => message.id === 'user-2');
    expect(reminderIndex).toBeGreaterThan(sent.findIndex((message) => message.id === 'output-edit'));
    expect(reminderIndex).toBeLessThan(promptIndex);
    expect(sent[reminderIndex]?.content).toContain('The previous turn was interrupted by the user. 1 tool call(s)');
    expect(events.some((event) => event.type === 'message.appended' && isReminder(event.message))).toBe(true);
  });

  it('should add nothing when the previous run finished normally', async () => {
    const { transport } = await promptAfter([
      { id: 'user-1', role: 'user', content: 'Hello' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
        metadata: { stopReason: 'stop' },
      },
    ]);

    expect((transport.requests[0]?.messages ?? []).some((message) => isReminder(message))).toBe(false);
  });

  it('should not add a second reminder when the stopped history already carries one', async () => {
    const first = await promptAfter(stoppedRun);
    const reminder = first.transport.requests[0]?.messages.find((message) => isReminder(message));
    if (reminder === undefined) {
      throw new Error('expected a reminder');
    }

    const { transport } = await promptAfter([...stoppedRun, reminder]);

    expect((transport.requests[0]?.messages ?? []).filter((message) => isReminder(message))).toHaveLength(1);
  });
});

/*
 * Launch audit C-7. A history that ends in a reply that was stopped or failed, with no interrupted tool output behind
 * it, took the tool tally's default cause: every Stop mid-reply told the model the turn "was cut short by a network
 * drop", with "0 tool call(s) completed successfully and 0 were cancelled". A Stop mid-tool got two reminders that
 * disagreed, because the stopped run had already written the right one before its empty stopped reply.
 */
describe('interrupt reminder after a reply that was stopped or failed with no tool cancelled', () => {
  const reminderAfter = async (messages: readonly ProviderMessage[]): Promise<readonly string[]> => {
    const { transport } = await promptAfter(messages);
    return (transport.requests[0]?.messages ?? [])
      .filter((message) => isReminder(message))
      .map((message) => (typeof message.content === 'string' ? message.content : ''));
  };

  const stoppedReply: ProviderMessage = {
    id: 'assistant-stopped',
    role: 'assistant',
    content: [{ type: 'text', text: 'Working on' }],
    metadata: { stopReason: 'aborted' },
  };

  it('should say the turn was stopped, and nothing about a network drop or tool counts', async () => {
    const reminders = await reminderAfter([{ id: 'user-1', role: 'user', content: 'Write an essay.' }, stoppedReply]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toContain('The previous turn was stopped before it finished.');
    expect(reminders[0]).not.toContain('network drop');
    expect(reminders[0]).not.toContain('tool call(s)');
  });

  it('should say the turn ended with an error when its last reply failed', async () => {
    const reminders = await reminderAfter([
      { id: 'user-1', role: 'user', content: 'Write an essay.' },
      { ...stoppedReply, metadata: { stopReason: 'error' } },
    ]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toContain('The previous turn ended with an error before it finished.');
    expect(reminders[0]).not.toContain('network drop');
  });

  it('should add no second reminder when the stopped run already reminded after its cancelled tools', async () => {
    const first = await promptAfter(stoppedRun);
    const reminder = first.transport.requests[0]?.messages.find((message) => isReminder(message));
    if (reminder === undefined) {
      throw new Error('expected a reminder');
    }

    /* What a Stop during a tool leaves: the cancelled output, the run's own reminder, then its empty stopped reply. */
    const reminders = await reminderAfter([
      ...stoppedRun,
      reminder,
      { id: 'assistant-stopped', role: 'assistant', content: [], metadata: { stopReason: 'aborted' } },
    ]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toContain('The previous turn was interrupted by the user. 1 tool call(s)');
  });

  it('should send one reminder, naming the stop, on the turn after a Stop pressed while a tool ran', async () => {
    const file = createMemoryEventLogFile();
    const toolStarted = Promise.withResolvers<void>();
    const registry: ToolRegistry = {
      list: () => [
        {
          name: 'read_file',
          description: 'read',
          inputSchema: { type: 'object', properties: { targetFile: { type: 'string' } } },
        },
      ],
      invoke: async (invocation) =>
        new Promise((_resolve, reject) => {
          toolStarted.resolve();
          invocation.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    };
    const model = { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' } as const;
    const stopped = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'system',
      model,
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          yield { type: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', input: { targetFile: 'main.ts' } };
          yield { type: 'completed', stopReason: 'toolUse' };
        },
      },
      toolRegistry: registry,
      eventLog: await file.open(),
    });
    const running = stopped.prompt({ id: 'user-1', role: 'user', content: 'Read main.ts' });
    await toolStarted.promise;
    /* Pi reaches the tool batch once the completed reply is replayed after the stream ends. */
    await sleep(50);
    stopped.abort();
    await running;
    await stopped.close();

    const transport = new RecordingTransport();
    const next = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-2',
      leaderEpoch: 'epoch-2',
      systemPrompt: 'system',
      model,
      modelTransport: transport,
      toolRegistry: registry,
      eventLog: await file.open(),
    });
    await next.prompt({ id: 'user-2', role: 'user', content: 'Carry on.' });
    await next.close();

    const reminders = (transport.requests[0]?.messages ?? []).filter((message) => isReminder(message));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.content).toContain('The previous turn was interrupted by the user.');
  });
});
