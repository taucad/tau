import type { GlobSearchRpcInput, GlobSearchRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import type { StatContentMetadata } from '@taucad/types';
import { listedFileMetadataFields } from '#rpc/listed-file-metadata.js';

type GlobSearchEntry = Extract<GlobSearchRpcResult, { success: true }>['entries'][number];

type CollectedEntry = {
  path: string;
  isDirectory: false;
  size: number;
  modifiedAt?: string;
} & StatContentMetadata;

async function collectFileEntries(
  fileSystem: RpcFileSystem,
  basePath: string,
  includeExplicitOnly: boolean,
): Promise<CollectedEntry[]> {
  const result: CollectedEntry[] = [];
  const entries = await fileSystem.readdir(basePath);

  for (const entry of entries) {
    const fullPath = joinRelativePath(basePath, entry.name);
    if (entry.type === 'file') {
      result.push({
        path: fullPath,
        isDirectory: false,
        size: entry.size,
        ...listedFileMetadataFields(entry),
        ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
      });
    } else if (includeExplicitOnly || entry.traverseOnImplicitSearch !== false) {
      // oxlint-disable-next-line no-await-in-loop -- recursive traversal
      const subEntries = await collectFileEntries(fileSystem, fullPath, includeExplicitOnly);
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
    const basePath = assertRootedPath(input.path ?? '');
    const explicitlyScopedToSkills = basePath === '.agents/skills' || basePath.startsWith('.agents/skills/');
    const allEntries = await collectFileEntries(fileSystem, basePath, explicitlyScopedToSkills);

    const { minimatch } = await import('minimatch');
    const matched = allEntries.filter((entry) => minimatch(entry.path, input.pattern, { matchBase: true, dot: true }));

    const files = matched.map((entry) => entry.path);
    const entries: GlobSearchEntry[] = matched.map((entry) => ({
      path: entry.path,
      isDirectory: entry.isDirectory,
      size: entry.size,
      ...listedFileMetadataFields(entry),
      ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
    }));

    return { success: true, files, entries, totalFiles: files.length };
  } catch (error) {
    return toRpcError(error);
  }
}
