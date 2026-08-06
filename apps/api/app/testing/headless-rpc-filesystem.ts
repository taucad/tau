import type { RuntimeFileSystemBase } from '@taucad/runtime';
import { ResourceQueue } from '@taucad/filesystem';
import type { RpcDirectoryEntry, RpcFileSystem, RpcFileStat } from '@taucad/chat/rpc';
import { getErrno } from '@taucad/utils/error';
import { joinRelativePath, resolveVirtualPath } from '@taucad/utils/path';

const toRuntimePath = (path: string): string => resolveVirtualPath(path === '' ? '/' : `/${path}`);

/**
 * Adapts a primitive `RuntimeFileSystemBase` to the `RpcFileSystem`
 * interface used by headless API tests.
 */
export function createHeadlessRpcFileSystem(fs: RuntimeFileSystemBase): RpcFileSystem {
  const mutationQueue = new ResourceQueue();

  return {
    async readFile(path: string): Promise<string> {
      return fs.readFile(toRuntimePath(path), 'utf8');
    },
    async writeFile(path: string, content: string): Promise<void> {
      const runtimePath = toRuntimePath(path);
      await mutationQueue.queueFor(runtimePath, async () => fs.writeFile(runtimePath, content));
    },
    async writeBinaryFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
      const runtimePath = toRuntimePath(path);
      const ownedData = new Uint8Array(data);
      await mutationQueue.queueFor(runtimePath, async () => fs.writeFile(runtimePath, ownedData));
    },
    async deleteFile(path: string): Promise<void> {
      const runtimePath = toRuntimePath(path);
      await mutationQueue.queueFor(runtimePath, async () => fs.unlink(runtimePath));
    },
    async readdir(path: string): Promise<RpcDirectoryEntry[]> {
      const names = await fs.readdir(toRuntimePath(path));
      const entries = await Promise.all(
        names.map(async (name): Promise<RpcDirectoryEntry | undefined> => {
          const childPath = toRuntimePath(joinRelativePath(path, name));
          try {
            const info = await fs.stat(childPath);
            if (info.type === 'dir') {
              return {
                name,
                type: 'dir',
                size: info.size,
                modifiedAt: new Date(info.mtimeMs).toISOString(),
              };
            }
            if (info.contentKind === 'text') {
              return {
                name,
                type: 'file',
                size: info.size,
                contentKind: 'text',
                lineCount: info.lineCount,
                modifiedAt: new Date(info.mtimeMs).toISOString(),
              };
            }
            return {
              name,
              type: 'file',
              size: info.size,
              contentKind: 'binary',
              modifiedAt: new Date(info.mtimeMs).toISOString(),
            };
          } catch (error) {
            if (getErrno(error) === 'ENOENT') {
              return undefined;
            }
            throw error;
          }
        }),
      );

      return entries.filter((entry): entry is RpcDirectoryEntry => entry !== undefined);
    },
    async exists(path: string): Promise<boolean> {
      return fs.exists(toRuntimePath(path));
    },
    async appendFile(path: string, content: string): Promise<void> {
      const runtimePath = toRuntimePath(path);
      await mutationQueue.queueFor(runtimePath, async () => {
        let existing = '';
        try {
          existing = await fs.readFile(runtimePath, 'utf8');
        } catch (error) {
          if (getErrno(error) !== 'ENOENT') {
            throw error;
          }
        }

        await fs.writeFile(runtimePath, existing + content);
      });
    },
    async editFile(
      path: string,
      oldString: string,
      newString: string,
      replaceAll?: boolean,
    ): Promise<{ occurrences: number }> {
      const runtimePath = toRuntimePath(path);
      return mutationQueue.queueFor(runtimePath, async () => {
        const content = await fs.readFile(runtimePath, 'utf8');
        const occurrences = replaceAll ? content.split(oldString).length - 1 : content.includes(oldString) ? 1 : 0;
        if (occurrences === 0) {
          throw new Error(`String not found in ${path}`);
        }
        await fs.writeFile(
          runtimePath,
          replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString),
        );
        return { occurrences };
      });
    },
    async stat(path: string): Promise<RpcFileStat> {
      const runtimePath = toRuntimePath(path);
      const info = await fs.stat(runtimePath);
      const isoDate = new Date(info.mtimeMs).toISOString();
      if (info.type === 'dir') {
        return {
          size: info.size,
          isDirectory: true,
          createdAt: isoDate,
          modifiedAt: isoDate,
        };
      }
      return info.contentKind === 'text'
        ? {
            size: info.size,
            isDirectory: false,
            createdAt: isoDate,
            modifiedAt: isoDate,
            contentKind: 'text',
            lineCount: info.lineCount,
          }
        : {
            size: info.size,
            isDirectory: false,
            createdAt: isoDate,
            modifiedAt: isoDate,
            contentKind: 'binary',
          };
    },
  };
}
