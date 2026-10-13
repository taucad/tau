import { describe, expect, it, vi } from 'vitest';
import { createChatMessageQueueStore, chatMessageQueuePath } from './chat-message-queue-store.js';
import type { QueuedChatMessage } from './chat-message-queue-store.js';
import { KeyedMutex } from './keyed-mutex.js';

const item = (id: string): QueuedChatMessage => ({
  id,
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
});
const fixture = () => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const client = {
    readFile: async (path: string) => {
      const bytes = files.get(path);
      if (!bytes) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return bytes;
    },
    writeFile: vi.fn(async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
      files.set(path, bytes);
    }),
    unlink: async (path: string) => {
      files.delete(path);
    },
  };
  const mutex = new KeyedMutex<string>();
  const lock = mutex.run.bind(mutex);
  const path = chatMessageQueuePath('project', 'chat');
  return { files, client, path, open: () => createChatMessageQueueStore(client, path, lock) };
};
describe('durable chat message queue', () => {
  it('should preserve simultaneous submissions from independent clients across reopen', async () => {
    const f = fixture();
    const a = f.open();
    const b = f.open();
    await Promise.all([a.enqueue(item('one')), b.enqueue(item('two'))]);
    const saved1 = await f.open().read();
    expect(saved1.items).toEqual([item('one'), item('two')]);
    expect(f.path).toBe('/.tau/composers/chats/project/chat/queue.json');
  });
  it('should keep saved items when a write fails and allow retry', async () => {
    const f = fixture();
    const q = f.open();
    await q.enqueue(item('one'));
    f.client.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await expect(q.enqueue(item('two'))).rejects.toThrow('disk full');
    const saved2 = await q.read();
    expect(saved2.items).toEqual([item('one')]);
    await q.enqueue(item('two'));
    const saved = await q.read();
    expect(saved.items.map((i) => i.id)).toEqual(['one', 'two']);
  });
  it('should preserve unreadable bytes instead of replacing them with an empty queue', async () => {
    const f = fixture();
    const bytes = new TextEncoder().encode('{broken');
    f.files.set(f.path, bytes);
    await expect(f.open().enqueue(item('one'))).rejects.toThrow();
    expect(f.files.get(f.path)).toEqual(bytes);
  });
  it('should prohibit editing or deleting a prepared delivery until matching acknowledgement', async () => {
    const f = fixture();
    const q = f.open();
    const one = item('one');
    const command = {
      type: 'start',
      commandId: one.requestId,
      payload: {
        chatId: 'chat',
        runId: one.requestId,
        trigger: 'submit',
        message: { id: one.id, role: 'user', content: 'one' },
      },
    } as const;
    await q.enqueue({ ...one, command });
    await expect(q.change('one', () => undefined)).rejects.toThrow('being sent');
    await q.acknowledge('one', 'wrong-key');
    const saved3 = await q.read();
    expect(saved3.items).toHaveLength(1);
    const reopened = await f.open().read();
    expect(reopened.items[0]?.command).toEqual(command);
    await q.acknowledge('one', one.requestId);
    const saved4 = await q.read();
    expect(saved4.items).toEqual([]);
  });
  it('should make duplicate enqueue idempotent and preserve attachments in the saved message', async () => {
    const f = fixture();
    const q = f.open();
    const one = item('one');
    const image = {
      ...one,
      message: {
        ...one.message,
        parts: [
          ...one.message.parts,
          { type: 'file', mediaType: 'image/png', url: `attachments/${'a'.repeat(64)}.png` } as const,
        ],
      },
    };
    await q.enqueue(image);
    await q.enqueue(image);
    const saved5 = await f.open().read();
    expect(saved5.items).toEqual([image]);
  });
});
