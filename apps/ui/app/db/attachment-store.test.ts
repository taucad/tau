import { describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '@taucad/utils/hash';
import { createAttachmentStore, createChatAttachmentStore } from '#db/attachment-store.js';
import { attachmentUrl } from '#utils/attachment.utils.js';

const directory = '/.tau/composers/new-project/attachments';
const otherDirectory = '/projects/p1/.tau/chats/c1/attachments';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const pdf = new TextEncoder().encode('%PDF-1.7\n');

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

const memoryClient = () => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const under = (path: string): string[] =>
    [...files.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));
  return {
    files,
    readFile: vi.fn(async (path: string) => {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw notFound(path);
      }
      return bytes;
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array<ArrayBuffer>) => {
      files.set(path, data);
    }),
    exists: vi.fn(async (path: string) => files.has(path)),
    readdir: vi.fn(async (path: string) => {
      const names = under(path);
      // A directory that was never written does not exist on the real client either.
      if (names.length === 0) {
        throw notFound(path);
      }
      return names;
    }),
    unlink: vi.fn(async (path: string) => {
      files.delete(path);
    }),
    rmdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
      const names = under(path);
      if (names.length === 0) {
        throw notFound(path);
      }
      expect(options).toEqual({ recursive: true });
      for (const name of names) {
        files.delete(`${path}/${name}`);
      }
    }),
  };
};

describe('attachment store', () => {
  describe('put', () => {
    it('should name the file by the SHA-256 of its bytes', async () => {
      const client = memoryClient();
      const stored = await createAttachmentStore(client, directory).put(png, 'image/png', 'diagram.png');

      expect(stored).toEqual({
        hash: await sha256Bytes(png),
        mediaType: 'image/png',
        byteLength: png.byteLength,
        filename: 'diagram.png',
      });
      expect([...client.files.keys()]).toEqual([`${directory}/${stored.hash}.png`]);
      expect(attachmentUrl(stored)).toBe(`attachments/${stored.hash}.png`);
    });

    it('should omit filename when none is supplied', async () => {
      const client = memoryClient();
      expect(await createAttachmentStore(client, directory).put(pdf, 'application/pdf')).not.toHaveProperty('filename');
    });

    it('should write once and stay idempotent for equal bytes', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);

      const first = await store.put(png, 'image/png');
      const second = await store.put(png, 'image/png');

      expect(second).toEqual(first);
      expect(client.writeFile).toHaveBeenCalledOnce();
      expect(client.files.size).toBe(1);
    });

    it('should produce exactly one file and one write for 100 concurrent puts of the same bytes', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);

      const stored = await Promise.all(Array.from({ length: 100 }, async () => store.put(png, 'image/png')));

      expect(new Set(stored.map((entry) => entry.hash)).size).toBe(1);
      expect(client.writeFile).toHaveBeenCalledOnce();
      expect(client.files.size).toBe(1);
    });

    it('should reject an image over the 4 MiB cap without writing', async () => {
      const client = memoryClient();
      const oversized = new Uint8Array(4 * 1024 * 1024 + 1);

      await expect(createAttachmentStore(client, directory).put(oversized, 'image/png')).rejects.toThrow(
        'Attachment exceeds the 4 MB limit for images',
      );
      expect(client.writeFile).not.toHaveBeenCalled();
      expect(client.files.size).toBe(0);
    });

    it('should reject a PDF over the 16 MiB cap without writing', async () => {
      const client = memoryClient();
      const oversized = new Uint8Array(16 * 1024 * 1024 + 1);

      await expect(createAttachmentStore(client, directory).put(oversized, 'application/pdf')).rejects.toThrow(
        'Attachment exceeds the 16 MB limit for documents',
      );
      expect(client.writeFile).not.toHaveBeenCalled();
      expect(client.files.size).toBe(0);
    });

    it('should reject an unsupported media type without writing', async () => {
      const client = memoryClient();

      await expect(createAttachmentStore(client, directory).put(png, 'image/avif')).rejects.toThrow(
        'Unsupported attachment type: image/avif',
      );
      expect(client.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('read and has', () => {
    it('should read the stored bytes back by attachment and by URL', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);
      const stored = await store.put(pdf, 'application/pdf', 'spec.pdf');

      expect(await store.read(stored)).toEqual(pdf);
      expect(await store.read(attachmentUrl(stored))).toEqual(pdf);
      expect(await store.has(stored)).toBe(true);
    });

    it('should resolve undefined for an absent attachment rather than throwing', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);

      expect(await store.read(`attachments/${'b'.repeat(64)}.png`)).toBeUndefined();
      expect(await store.has(`attachments/${'b'.repeat(64)}.png`)).toBe(false);
    });

    it('should resolve undefined instead of throwing when the client read fails', async () => {
      const client = memoryClient();
      client.readFile.mockRejectedValueOnce(new Error('disk on fire'));
      const store = createAttachmentStore(client, directory);
      const stored = await store.put(png, 'image/png');

      expect(await store.read(stored)).toBeUndefined();
    });

    it('should resolve undefined for a URL that is not an attachment reference', async () => {
      const store = createAttachmentStore(memoryClient(), directory);

      expect(await store.read('data:image/png;base64,AA==')).toBeUndefined();
      expect(await store.has('../../etc/passwd')).toBe(false);
    });
  });

  describe('copyTo', () => {
    it('should copy the bytes into the target and skip a target that already holds them', async () => {
      const source = memoryClient();
      const target = memoryClient();
      const store = createAttachmentStore(source, directory);
      const chat = createAttachmentStore(target, otherDirectory);
      const stored = await store.put(png, 'image/png', 'diagram.png');

      await store.copyTo(chat, stored);
      expect([...target.files.keys()]).toEqual([`${otherDirectory}/${stored.hash}.png`]);
      expect(await chat.read(stored)).toEqual(png);
      expect(target.writeFile).toHaveBeenCalledOnce();

      await store.copyTo(chat, stored);
      expect(target.writeFile).toHaveBeenCalledOnce();
      expect(target.files.size).toBe(1);
    });

    it('should fail loudly when the source bytes are gone so nothing references a missing blob', async () => {
      const source = memoryClient();
      const store = createAttachmentStore(source, directory);
      const chat = createAttachmentStore(memoryClient(), otherDirectory);
      const stored = await store.put(png, 'image/png');
      source.files.clear();

      await expect(store.copyTo(chat, stored)).rejects.toThrow(stored.hash);
    });

    /*
     * A draft hydrated after a reload, or a chat attachment a cancelled draft
     * copies back, is a reference read from a file part: it names its hash,
     * media type and file name, never its size (P29). Promotion needs no more.
     */
    it('should promote a reference that carries no byte length', async () => {
      const source = memoryClient();
      const target = memoryClient();
      const store = createAttachmentStore(source, directory);
      const chat = createAttachmentStore(target, otherDirectory);
      const { hash, mediaType } = await store.put(pdf, 'application/pdf', 'spec.pdf');

      await store.copyTo(chat, { hash, mediaType, filename: 'spec.pdf' });

      expect(await chat.read({ hash, mediaType })).toEqual(pdf);
    });
  });

  describe('remove', () => {
    it('should unlink only the named attachment and treat an absent one as removed', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);
      const image = await store.put(png, 'image/png');
      const document = await store.put(pdf, 'application/pdf', 'spec.pdf');

      await store.remove(image);
      client.unlink.mockRejectedValueOnce(notFound('gone'));
      await store.remove(image);

      expect(await store.has(image)).toBe(false);
      expect(await store.has(document)).toBe(true);
    });
  });

  describe('createChatAttachmentStore', () => {
    it('should root a chat attachment store beside that chat record', async () => {
      const client = memoryClient();
      const chat = createChatAttachmentStore(client, 'p1', 'c1');
      const stored = await chat.put(png, 'image/png');

      expect([...client.files.keys()]).toEqual([`${otherDirectory}/${stored.hash}.png`]);
    });
  });

  describe('retainOnly', () => {
    it('should unlink exactly the unreferenced files', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);
      const kept = await store.put(png, 'image/png');
      const dropped = await store.put(pdf, 'application/pdf');

      await store.retainOnly([kept]);

      expect([...client.files.keys()]).toEqual([`${directory}/${kept.hash}.png`]);
      expect(client.unlink).toHaveBeenCalledExactlyOnceWith(`${directory}/${dropped.hash}.pdf`);
    });

    it('should accept URLs as references', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);
      const kept = await store.put(png, 'image/png');
      await store.put(pdf, 'application/pdf');

      await store.retainOnly([attachmentUrl(kept)]);

      expect([...client.files.keys()]).toEqual([`${directory}/${kept.hash}.png`]);
    });

    it('should tolerate a directory that was never created', async () => {
      const client = memoryClient();

      await expect(createAttachmentStore(client, directory).retainOnly([])).resolves.toBeUndefined();
      expect(client.unlink).not.toHaveBeenCalled();
    });
  });

  describe('removeAll', () => {
    it('should remove the directory recursively and stay idempotent', async () => {
      const client = memoryClient();
      const store = createAttachmentStore(client, directory);
      await store.put(png, 'image/png');
      await store.put(pdf, 'application/pdf');

      await store.removeAll();
      expect(client.files.size).toBe(0);

      await expect(store.removeAll()).resolves.toBeUndefined();
    });

    it('should propagate a removal failure that is not a missing directory', async () => {
      const client = memoryClient();
      client.rmdir.mockRejectedValueOnce(new Error('mount is read-only'));

      await expect(createAttachmentStore(client, directory).removeAll()).rejects.toThrow('mount is read-only');
    });
  });
});
