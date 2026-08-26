import type { ListDirectoryRpcInput, ListDirectoryRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { resolveRpcProjectPath } from '#rpc/rpc-project-path.js';

type ListDirectoryEntry = Extract<ListDirectoryRpcResult, { success: true }>['entries'][number];

/** @public */
export async function handleListDirectory(
  input: ListDirectoryRpcInput,
  fileSystem: RpcFileSystem,
): Promise<ListDirectoryRpcResult> {
  try {
    const path = resolveRpcProjectPath(input.path ?? '');
    const rawEntries = await fileSystem.readdir(path);
    const entries: ListDirectoryEntry[] = rawEntries.map((entry) => {
      if (entry.type === 'dir') {
        return {
          name: entry.name,
          type: 'dir',
          size: entry.size,
          ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
        };
      }
      return {
        name: entry.name,
        type: 'file',
        size: entry.size,
        ...(entry.contentKind === 'text'
          ? { contentKind: 'text', lineCount: entry.lineCount }
          : { contentKind: 'binary' }),
        ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
      };
    });

    return { success: true, entries, path: path || '/' };
  } catch (error) {
    return toRpcError(error);
  }
}
