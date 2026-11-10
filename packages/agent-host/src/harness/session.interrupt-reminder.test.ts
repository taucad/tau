import { describe, expect, it, vi } from 'vitest';

import type { ProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';
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
