/**
 * Test fixture: an OPFS directory in memory whose files give one sync access handle at a time, as a browser's do. A
 * second `createSyncAccessHandle` on an open file is refused `NoModificationAllowedError` until the first closes.
 */

type MemoryFile = { bytes: Uint8Array<ArrayBuffer>; open: boolean };

/** The files of one {@link memoryOpfsDirectory}, by path. */
export type MemoryOpfsFiles = Map<string, MemoryFile>;

const domError = (name: string, message: string): Error => Object.assign(new Error(message), { name });

/**
 * An in-memory OPFS directory over `files`.
 *
 * @param files - The directory's files, by path; the case keeps it to see which are open.
 * @param prefix - The path of this directory in `files`; the root when absent.
 * @param directories - The directories created so far; the root's own set when absent.
 * @returns The directory handle a browser chat store's `opfs` log takes.
 */
export const memoryOpfsDirectory = (
  files: MemoryOpfsFiles,
  prefix = '',
  directories = new Set<string>(),
): FileSystemDirectoryHandle => {
  const fileHandle = (file: MemoryFile): unknown => ({
    kind: 'file',
    getFile: async () => ({
      size: file.bytes.byteLength,
      lastModified: 1,
      arrayBuffer: async () => new Uint8Array(file.bytes).buffer,
    }),
    createSyncAccessHandle: async () => {
      if (file.open) {
        throw domError('NoModificationAllowedError', 'The file already has an open access handle.');
      }
      file.open = true;
      return {
        getSize: () => file.bytes.byteLength,
        read: (buffer: Uint8Array<ArrayBuffer>, options?: { at?: number }) => {
          const slice = file.bytes.subarray(options?.at ?? 0, (options?.at ?? 0) + buffer.byteLength);
          buffer.set(slice);
          return slice.byteLength;
        },
        write: (buffer: Uint8Array<ArrayBuffer>, options?: { at?: number }) => {
          const from = options?.at ?? file.bytes.byteLength;
          const next = new Uint8Array(Math.max(file.bytes.byteLength, from + buffer.byteLength));
          next.set(file.bytes);
          next.set(buffer, from);
          file.bytes = next;
          return buffer.byteLength;
        },
        truncate: (size: number) => {
          file.bytes = file.bytes.slice(0, size);
        },
        flush: () => undefined,
        close: () => {
          file.open = false;
        },
      };
    },
  });
  const directory = {
    kind: 'directory',
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      const path = `${prefix}${name}/`;
      if (!directories.has(path)) {
        if (options?.create !== true) {
          throw domError('NotFoundError', `${path} was not found.`);
        }
        directories.add(path);
      }
      return memoryOpfsDirectory(files, path, directories);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const path = `${prefix}${name}`;
      let file = files.get(path);
      if (file === undefined) {
        if (options?.create !== true) {
          throw domError('NotFoundError', `${path} was not found.`);
        }
        file = { bytes: new Uint8Array(), open: false };
        files.set(path, file);
      }
      return fileHandle(file);
    },
    async *keys() {
      const seen = new Set<string>();
      for (const path of [...files.keys(), ...directories]) {
        const [name] = path.startsWith(prefix) ? path.slice(prefix.length).split('/') : [];
        if (name !== undefined && name.length > 0 && !seen.has(name)) {
          seen.add(name);
          yield name;
        }
      }
    },
  };
  return directory as unknown as FileSystemDirectoryHandle;
};

/**
 * How many of the directory's files have an access handle open now.
 *
 * @param files - The directory's files.
 * @returns The count of open handles.
 */
export const openHandles = (files: MemoryOpfsFiles): number => [...files.values()].filter((file) => file.open).length;
