/**
 * Content-addressed attachment bytes rooted at one directory (blueprint D12,
 * D16-D19).
 *
 * Two roots exist: a composer record's own `<record dir>/attachments`, and a
 * chat's `/projects/<projectId>/.tau/chats/<chatId>/attachments`. Content
 * addressing makes every write idempotent, so promotion is a copy and a
 * repeated ingest is free.
 */

import { getErrno } from '@taucad/utils/error';
import { sha256Bytes } from '@taucad/utils/hash';
import { KeyedMutex } from '#db/keyed-mutex.js';
import {
  attachmentCapBytes,
  attachmentFileName,
  attachmentKind,
  isAttachmentUrl,
  isSupportedAttachmentMediaType,
  type Attachment,
} from '#utils/attachment.utils.js';

/** The filesystem surface an attachment store needs, so tests and hosts can supply anything shaped like it. */
type AttachmentClient = {
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFile: (path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  readdir: (path: string) => Promise<string[]>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
};

/** An attachment reference: the stored attachment itself, or its `attachments/<hash>.<ext>` URL. */
export type AttachmentRef = Attachment | string;

/** The attachment store rooted at one directory. */
export type AttachmentStore = {
  put: (bytes: Uint8Array<ArrayBuffer>, mediaType: string, filename?: string) => Promise<Attachment>;
  read: (ref: AttachmentRef) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  has: (ref: AttachmentRef) => Promise<boolean>;
  copyTo: (target: AttachmentStore, attachment: Attachment) => Promise<void>;
  retainOnly: (referenced: Iterable<AttachmentRef>) => Promise<void>;
  removeAll: () => Promise<void>;
};

// Keyed by absolute path, so two stores over the same directory still serialise.
const mutex = new KeyedMutex<string>();

const attachmentDirectory = 'attachments/';

const isNotFound = (error: unknown): boolean => {
  const code = getErrno(error);
  return code === 'ENOENT' || code === 'ENOTDIR' || (error as { name?: unknown }).name === 'NotFoundError';
};

/**
 * The file name a reference resolves to, or `undefined` when it is not an
 * attachment reference at all (a `data:` URL, a traversal attempt, an
 * unsupported media type). Callers treat `undefined` as absent.
 */
const fileNameOf = (ref: AttachmentRef): string | undefined => {
  if (typeof ref !== 'string') {
    return isSupportedAttachmentMediaType(ref.mediaType) ? attachmentFileName(ref) : undefined;
  }
  const name = ref.startsWith(attachmentDirectory) ? ref.slice(attachmentDirectory.length) : ref;
  return isAttachmentUrl(`${attachmentDirectory}${name}`) ? name : undefined;
};

/** Create the attachment store rooted at `directory`. */
export function createAttachmentStore(client: AttachmentClient, directory: string): AttachmentStore {
  const pathOf = (ref: AttachmentRef): string | undefined => {
    const name = fileNameOf(ref);
    return name === undefined ? undefined : `${directory}/${name}`;
  };

  const read = async (ref: AttachmentRef): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    const path = pathOf(ref);
    if (path === undefined) {
      return undefined;
    }
    try {
      return await client.readFile(path);
    } catch {
      // D19: a reference whose bytes cannot be read renders a placeholder; it never throws.
      return undefined;
    }
  };

  const has = async (ref: AttachmentRef): Promise<boolean> => {
    const path = pathOf(ref);
    return path === undefined ? false : client.exists(path);
  };

  const put = async (bytes: Uint8Array<ArrayBuffer>, mediaType: string, filename?: string): Promise<Attachment> => {
    if (!isSupportedAttachmentMediaType(mediaType)) {
      throw new Error(`Unsupported attachment type: ${mediaType}`);
    }
    const kind = attachmentKind(mediaType);
    const cap = attachmentCapBytes(kind);
    if (bytes.byteLength > cap) {
      // Checked before hashing so an oversized file costs nothing.
      throw new Error(`Attachment exceeds the ${cap / 1024 / 1024} MB limit for ${kind}s.`);
    }

    const attachment: Attachment = {
      hash: await sha256Bytes(bytes),
      mediaType,
      byteLength: bytes.byteLength,
      ...(filename === undefined ? {} : { filename }),
    };
    const path = `${directory}/${attachmentFileName(attachment)}`;
    await mutex.run(path, async () => {
      if (!(await client.exists(path))) {
        await client.writeFile(path, bytes);
      }
    });
    return attachment;
  };

  return {
    put,
    read,
    has,
    // D16: promotion copies; it never points a chat at another chat's bytes.
    copyTo: async (target, attachment) => {
      if (await target.has(attachment)) {
        return;
      }
      const bytes = await read(attachment);
      if (bytes === undefined) {
        throw new Error(`Attachment ${attachment.hash} is missing; nothing was copied.`);
      }
      await target.put(bytes, attachment.mediaType, attachment.filename);
    },
    retainOnly: async (referenced) => {
      const keep = new Set<string>();
      for (const ref of referenced) {
        const name = fileNameOf(ref);
        if (name !== undefined) {
          keep.add(name);
        }
      }
      let names: string[];
      try {
        names = await client.readdir(directory);
      } catch (error) {
        if (isNotFound(error)) {
          return;
        }
        throw error;
      }
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => client.unlink(`${directory}/${name}`)));
    },
    removeAll: async () => {
      try {
        await client.rmdir(directory, { recursive: true });
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
  };
}
