// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createOpfsEventLog } from '#browser.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The browser smoke deliberately traverses this package's public root entry.
import { createTauAgentHost } from '@taucad/agent-host';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { ScriptedParityModelTransport, scriptedParityResponses } from '#host/scripted-model.fixture.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ToolRegistry } from '#waist/ports.js';

type TestSyncAccessHandle = {
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

type TestFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<TestSyncAccessHandle>;
};

const readTool: ToolRegistry = {
  list: () => [
    {
      name: 'read_file',
      description: 'Read one browser-workspace file.',
      inputSchema: {
        type: 'object',
        properties: { targetFile: { type: 'string' } },
        required: ['targetFile'],
        additionalProperties: false,
      },
    },
  ],
  invoke: async () => ({ content: { content: 'worker fixture' }, isError: false }),
};

globalThis.addEventListener('message', async () => {
  const root = await navigator.storage.getDirectory();
  const tau = await root.getDirectoryHandle('.tau', { create: true });
  const chats = await tau.getDirectoryHandle('chats', { create: true });
  const chatId = 'host-worker-smoke';
  try {
    const chat = await chats.getDirectoryHandle(chatId, { create: true });
    const fileHandle = (await chat.getFileHandle('events.jsonl', { create: true })) as TestFileHandle;
    const seed = await fileHandle.createSyncAccessHandle();
    seed.truncate(0);
    seed.flush();
    seed.close();

    let id = 0;
    let epoch = 0;
    const host = createTauAgentHost({
      systemPrompt: 'Complete the browser worker smoke.',
      model: { id: 'scripted-g2-model', contextWindow: 200_000 },
      modelTransport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 2)),
      toolRegistry: readTool,
      openEventLog: async () => createOpfsEventLog({ fileHandle }),
      interruptPort: {
        pause: async (request) => ({ interruptId: request.interruptId, outcome: 'approved' }),
        pending: async () => [],
        resume: async () => undefined,
      },
      createId: () => `worker-message-${id++}`,
      createLeaderEpoch: () => `worker-epoch-${epoch++}`,
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    const messages = await host.admit({
      chatId,
      runId: 'worker-run',
      trigger: 'submit',
      message: { id: 'worker-turn', role: 'user', content: 'Read main.ts in the worker.' },
    });
    await host.close();

    const reopened = await createOpfsEventLog({ fileHandle });
    const events = await reopened.read();
    await reopened.close();
    globalThis.postMessage({
      origin: location.origin,
      eventTypes: events.map((event) => event.type),
      final: messages.findLast((message) => message.role === 'assistant')?.content,
    });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    await chats.removeEntry(chatId, { recursive: true }).catch(() => undefined);
  }
});
