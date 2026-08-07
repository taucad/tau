import type { GlobSearchRpcInput, GlobSearchRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { resolveRpcProjectPath } from '#rpc/rpc-project-path.js';
import type { FileContentMetadata } from '@taucad/types';
import { joinRelativePath } from '@taucad/utils/path';

type GlobSearchEntry = Extract<GlobSearchRpcResult, { success: true }>['entries'][number];

type CollectedEntry = {
  path: string;
  isDirectory: false;
  size: number;
  modifiedAt?: string;
} & FileContentMetadata;

async function collectFileEntries(fileSystem: RpcFileSystem, basePath: string): Promise<CollectedEntry[]> {
  const result: CollectedEntry[] = [];
  const entries = await fileSystem.readdir(basePath);

  for (const entry of entries) {
    const fullPath = joinRelativePath(basePath, entry.name);
    if (entry.type === 'file') {
      if (entry.contentKind === 'text') {
        result.push({
          path: fullPath,
          isDirectory: false,
          size: entry.size,
          contentKind: 'text',
          lineCount: entry.lineCount,
          ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
        });
      } else {
        result.push({
          path: fullPath,
          isDirectory: false,
          size: entry.size,
          contentKind: 'binary',
          ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
        });
      }
    } else {
      // oxlint-disable-next-line no-await-in-loop -- recursive traversal
      const subEntries = await collectFileEntries(fileSystem, fullPath);
      result.push(...subEntries);
    }
  }

  return result;
}

/** @public */
export async function handleGlobSearch(
  input: GlobSearchRpcInput,
  fileSystem: RpcFileSystem,
): Promise<GlobSearchRpcResult> {
  try {
    const basePath = resolveRpcProjectPath(input.path ?? '');
    const allEntries = await collectFileEntries(fileSystem, basePath);

    const { minimatch } = await import('minimatch');
    const matched = allEntries.filter((entry) => minimatch(entry.path, input.pattern, { matchBase: true }));

    const files = matched.map((entry) => entry.path);
    const entries: GlobSearchEntry[] = matched.map((entry) =>
      entry.contentKind === 'text'
        ? {
            path: entry.path,
            isDirectory: entry.isDirectory,
            size: entry.size,
            contentKind: 'text',
            lineCount: entry.lineCount,
            ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
          }
        : {
            path: entry.path,
            isDirectory: entry.isDirectory,
            size: entry.size,
            contentKind: 'binary',
            ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
          },
    );

    return { success: true, files, entries, totalFiles: files.length };
  } catch (error) {
    return toRpcError(error);
  }
}
