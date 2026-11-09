import type { GlobSearchRpcInput, GlobSearchRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';
import { listedFileMetadataFields } from '#rpc/listed-file-metadata.js';
import { indexedFilesUnder, isExplicitSkillsScope, walkFiles } from '#rpc/search-files.js';

type GlobSearchEntry = Extract<GlobSearchRpcResult, { success: true }>['entries'][number];

/**
 * The files a glob matches against. The index answers the subtree in one call
 * with head metadata, content facts only where already known (I3); a host
 * without one walks the directory, its listings measuring facts as they did.
 */
const filesUnder = async (fileSystem: RpcFileSystem, basePath: string) =>
  (await indexedFilesUnder(fileSystem, basePath)) ??
  walkFiles(fileSystem, basePath, { contentFacts: true, includeExplicitOnly: isExplicitSkillsScope(basePath) });

/** @public */
export async function handleGlobSearch(
  input: GlobSearchRpcInput,
  fileSystem: RpcFileSystem,
): Promise<GlobSearchRpcResult> {
  try {
    const basePath = assertRootedPath(input.path ?? '');
    const allEntries = await filesUnder(fileSystem, basePath);

    const { minimatch } = await import('minimatch');
    const matched = allEntries.filter((entry) => minimatch(entry.path, input.pattern, { matchBase: true, dot: true }));

    const files = matched.map((entry) => entry.path);
    const entries: GlobSearchEntry[] = matched.map((entry) => ({
      path: entry.path,
      isDirectory: false,
      size: entry.size,
      ...listedFileMetadataFields(entry),
      ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
    }));

    return { success: true, files, entries, totalFiles: files.length };
  } catch (error) {
    return toRpcError(error);
  }
}
