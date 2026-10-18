import { createOpfsEventLog } from '#browser.js';
import { createTauAgentHost } from '@taucad/agent-host';
import { ScriptedParityModelTransport, scriptedParityResponses } from '#host/scripted-model.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
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

/** A phone photo's size: every base64 chunk of it is a full argument list. */
const attachmentPath = `attachments/${'e'.repeat(64)}.jpg`;
const attachmentBytes = new Uint8Array(1024 * 1024).fill(0xff);

globalThis.addEventListener('message', async (event: MessageEvent<'run' | 'attachment'>) => {
  const withAttachment = event.data === 'attachment';
  const root = await navigator.storage.getDirectory();
  const tau = await root.getDirectoryHandle('.tau', { create: true });
  const chats = await tau.getDirectoryHandle('chats', { create: true });
  const chatId = withAttachment ? 'host-worker-attachment' : 'host-worker-smoke';
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
      openEventLog: async () => createOpfsEventLog({ fileHandle, access: 'write' }),
      createId: () => `worker-message-${id++}`,
      createLeaderEpoch: () => `worker-epoch-${epoch++}`,
      now: () => new Date('2026-09-01T00:00:00.000Z'),
      placement: fakePlacement({ registry: readTool }).port,
      ...(withAttachment ? { attachments: { read: async () => attachmentBytes } } : {}),
    });
    const messages = await host.admit({
      chatId,
      runId: 'worker-run',
      trigger: 'submit',
      message: {
        id: 'worker-turn',
        role: 'user',
        content: withAttachment
          ? [
              { type: 'text', text: 'Read main.ts in the worker.' },
              { type: 'file-ref', path: attachmentPath, mimeType: 'image/jpeg' },
            ]
          : 'Read main.ts in the worker.',
      },
    });
    const snapshot = await host.snapshot(chatId);
    await host.close();

    const reopened = await createOpfsEventLog({ fileHandle, access: 'write' });
    const events = await reopened.read();
    await reopened.close();
    const file = await fileHandle.getFile();
    const log = await file.text();
    globalThis.postMessage({
      log,
      origin: location.origin,
      eventTypes: events.map((event) => event.type),
      state: snapshot.state,
      failures: events.flatMap((row) =>
        row.type === 'run.lifecycle' && row.state === 'failed' ? [JSON.stringify(row)] : [],
      ),
      final: messages.findLast((message) => message.role === 'assistant')?.content,
    });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    await chats.removeEntry(chatId, { recursive: true }).catch(() => undefined);
  }
});
