import { describe, expect, it } from 'vitest';
import { readChatPlacementsShared, writeChatPlacement } from '#db/chat-placements.js';
import type { ComposerRecordClient } from '#db/composer-record-store.js';

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

/** A device with no records yet: every write is recorded. */
const emptyClient = () => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const writes: string[] = [];
  const client = {
    readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      const value = files.get(path);
      if (value === undefined) {
        throw notFound(path);
      }
      return value;
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
      writes.push(path);
      files.set(path, data);
    },
    exists: async (path: string): Promise<boolean> => files.has(path),
    readdir: async (path: string): Promise<string[]> => {
      throw notFound(path);
    },
    unlink: async (path: string): Promise<void> => {
      if (!files.delete(path)) {
        throw notFound(path);
      }
    },
    rename: async (from: string, to: string): Promise<void> => {
      const value = files.get(from);
      if (value === undefined) {
        throw notFound(from);
      }
      writes.push(to);
      files.set(to, value);
      files.delete(from);
    },
  };
  return { client: client as unknown as ComposerRecordClient, writes };
};

describe('writeChatPlacement', () => {
  /* XD2: clearing a placement no record holds changes nothing, so nothing is written. */
  it('should write nothing when clearing a placement on a device with no placements record', async () => {
    const { client, writes } = emptyClient();

    await expect(
      writeChatPlacement({ client, projectId: 'project-1', chatId: 'chat-1', placement: undefined }),
    ).resolves.toBe(true);

    expect(writes).toEqual([]);
  });

  /* A write that fails part way may still have changed the record: the next read reads it again, never a stale copy. */
  it('should read the record again after a write that failed part way', async () => {
    const { client } = emptyClient();
    const gate = Promise.withResolvers<void>();
    const writeFile = client.writeFile.bind(client);
    let failing = true;
    Object.assign(client, {
      writeFile: async (path: string, data: Uint8Array<ArrayBuffer>) => {
        await writeFile(path, data);
        if (failing) {
          failing = false;
          await gate.promise;
          throw new Error('The rename after the write failed.');
        }
      },
      rename: async () => {
        throw new Error('The rename after the write failed.');
      },
    });
    const writing = writeChatPlacement({ client, projectId: 'project-1', chatId: 'chat-1', placement: 'origin' });
    await Promise.resolve();
    const during = await readChatPlacementsShared(client, 'project-1');
    gate.resolve();

    await expect(writing).resolves.toBe(false);

    expect(during).toEqual({});
    /* The write landed before the failure: the next read sees it. */
    await expect(readChatPlacementsShared(client, 'project-1')).resolves.toEqual({ 'chat-1': 'origin' });
  });

  it('should write a placement on a device with no placements record', async () => {
    const { client, writes } = emptyClient();

    await expect(
      writeChatPlacement({ client, projectId: 'project-1', chatId: 'chat-1', placement: 'origin' }),
    ).resolves.toBe(true);

    expect(writes.length).toBeGreaterThan(0);
  });
});
