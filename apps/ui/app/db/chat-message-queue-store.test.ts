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
  it('should report invalid saved attachments as a recovery error and preserve the bytes', async () => {
    const f = fixture();
    const invalid = item('one');
    invalid.message.parts.push({ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA==' });
    await expect(f.open().enqueue(invalid)).rejects.toThrow('Save attachments before queueing this message.');
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, items: [invalid] }));
    f.files.set(f.path, bytes);
    await expect(f.open().read()).rejects.toThrow(
      'Queued messages could not be read. The saved file has been preserved.',
    );
    await expect(f.open().enqueue(item('two'))).rejects.toThrow('The saved file has been preserved.');
    expect(f.files.get(f.path)).toEqual(bytes);
    expect(f.client.writeFile).not.toHaveBeenCalled();
  });

  it('should persist arbitrary moves without replacing identities or concurrent submissions', async () => {
    const f = fixture();
    const a = f.open();
    await a.enqueue(item('one'));
    await a.enqueue(item('two'));
    await f.open().enqueue(item('three'));
    await a.move('one', undefined);
    const reordered1 = await f.open().read();
    expect(reordered1.items).toEqual([item('two'), item('three'), item('one')]);
    f.client.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await expect(a.move('one', 'three')).rejects.toThrow('disk full');
    const reordered2 = await f.open().read();
    expect(reordered2.items).toEqual([item('two'), item('three'), item('one')]);
    await a.move('one', 'three');
    await a.move('one', 'three');
    const reordered3 = await f.open().read();
    expect(reordered3.items).toEqual([item('two'), item('one'), item('three')]);
    await expect(a.move('one', 'missing')).rejects.toThrow('changed');
    const reordered4 = await f.open().read();
    expect(reordered4.items).toEqual([item('two'), item('one'), item('three')]);
  });
  it('should reject a stale reorder after another client prepares steering', async () => {
    const f = fixture();
    const a = f.open();
    await a.enqueue(item('one'));
    await f.open().enqueue({
      ...item('two'),
      steer: {
        type: 'cancel',
        commandId: 'cancel_two',
        payload: { chatId: 'chat', runId: 'active' },
      },
    });
    const before = await a.read();
    await expect(a.move('one', undefined)).rejects.toThrow('sending');
    expect(await f.open().read()).toEqual(before);
  });
  it('should preserve simultaneous submissions from independent clients across reopen', async () => {
    const f = fixture();
    const a = f.open();
    const b = f.open();
    await Promise.all([a.enqueue(item('one')), b.enqueue(item('two'))]);
    const saved1 = await f.open().read();
    expect(saved1.items).toEqual([item('one'), item('two')]);
    expect(f.path).toBe('/.tau/composers/chats/project/chat/queue.json');
  });
  it('should preserve terminal authorization and original message identity across reopen', async () => {
    const f = fixture();
    const authorized = { ...item('after-stop'), afterTerminalRunId: 'stopped-run' };
    await f.open().enqueue(authorized);
    const reopened = await f.open().read();
    expect(reopened.items).toEqual([authorized]);
    await f.open().enqueue({ ...authorized, afterTerminalRunId: 'different-run' });
    const duplicate = await f.open().read();
    expect(duplicate.items).toEqual([authorized]);
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
    await expect(q.move('one', undefined)).rejects.toThrow('sending');
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
