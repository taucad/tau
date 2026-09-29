import type { EventLogStorage } from '#log/event-log-appender.js';

/** A test storage without the fence's members; {@link withLength} adds them. */
export type BareEventLogStorage = Omit<EventLogStorage, 'size' | 'exclusive'>;

/**
 * Give a test storage the fence's `size` and an identity `exclusive`, tracking the length it wrote so a storage whose
 * `read` never changes still reports the bytes it holds.
 *
 * @param storage - A storage with read, append, truncate and close.
 * @returns The storage with `size` and `exclusive`.
 */
export const withLength = (storage: BareEventLogStorage): EventLogStorage => {
  let length: number | undefined;
  return {
    read: async () => {
      const bytes = await storage.read();
      length ??= bytes.byteLength;
      return bytes;
    },
    append: async (bytes) => {
      await storage.append(bytes);
      length = (length ?? 0) + bytes.byteLength;
    },
    truncate: async (size) => {
      await storage.truncate(size);
      length = size;
    },
    close: async () => storage.close(),
    size: async () => {
      if (length !== undefined) {
        return length;
      }
      const bytes = await storage.read();
      return bytes.byteLength;
    },
    exclusive: async (section) => section(),
  };
};

/**
 * An in-memory log file.
 *
 * @param initial - The file's bytes at open.
 * @returns The storage, and the bytes it holds now.
 */
export const memoryEventLogStorage = (
  initial: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0)),
): { readonly storage: EventLogStorage; bytes(): Uint8Array<ArrayBuffer> } => {
  let bytes = initial;
  return {
    storage: {
      read: async () => bytes,
      append: async (next) => {
        const combined = new Uint8Array(new ArrayBuffer(bytes.byteLength + next.byteLength));
        combined.set(bytes);
        combined.set(next, bytes.byteLength);
        bytes = combined;
      },
      truncate: async (size) => {
        bytes = bytes.slice(0, size);
      },
      close: async () => undefined,
      size: async () => bytes.byteLength,
      exclusive: async (section) => section(),
    },
    bytes: () => bytes,
  };
};
