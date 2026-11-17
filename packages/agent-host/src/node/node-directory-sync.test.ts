import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeAttachmentReader } from '#node.js';

/* Windows refuses `fsync` on a directory handle with EPERM. This suite gives every directory handle that behaviour,
 * so the Windows path (no directory sync) and the POSIX one (a sync, whose refusal surfaces) both run on any host. */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    open: vi.fn(async (...parameters: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...parameters);
      const stats = await handle.stat();
      if (stats.isDirectory()) {
        handle.sync = async () => {
          throw Object.assign(new Error('EPERM: operation not permitted, fsync'), { code: 'EPERM' });
        };
      }
      return handle;
    }),
  };
});

const { platform } = process;
const temporaryDirectories: string[] = [];

const chatId = 'chat-a';
const attachmentPath = `attachments/${'a'.repeat(64)}.png`;
const bytes = new Uint8Array([1, 2, 3]);

const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true });
};

const temporaryRoot = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-agent-host-sync-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  setPlatform(platform);
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Node directory sync', () => {
  it('should publish a chat attachment on Windows, where a directory cannot be synced', async () => {
    setPlatform('win32');
    const root = await temporaryRoot();

    await createNodeAttachmentReader(root).write!(chatId, attachmentPath, bytes);

    expect(new Uint8Array(await readFile(join(root, '.tau', 'chats', chatId, attachmentPath)))).toEqual(bytes);
  });

  it('should sync the attachment directory on POSIX and surface a refused sync', async () => {
    setPlatform('linux');
    const root = await temporaryRoot();

    await expect(createNodeAttachmentReader(root).write!(chatId, attachmentPath, bytes)).rejects.toMatchObject({
      code: 'EPERM',
    });
  });
});
