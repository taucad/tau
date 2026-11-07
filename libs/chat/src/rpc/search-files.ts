/**
 * The files `grep` and `glob_search` search (charter D13): the authority's
 * Project Index answers a directory's whole subtree in one call, and only a
 * host without an index, or a directory the index does not hold, is walked.
 *
 * @module
 */

import type { RpcFileSystem, RpcIndexedFile } from '#rpc/rpc-dependencies.js';
import { joinRelativePath } from '@taucad/utils/path';
import { listedFileMetadataFields } from '#rpc/listed-file-metadata.js';

/**
 * Whether a search names the skills directory itself, which an unscoped
 * search never enters (N9): skills composed above the project are listed only
 * when asked for, so such a search walks the view and its overlays.
 *
 * @param basePath - The search's canonical directory.
 * @returns True for `.agents/skills` and below.
 */
export const isExplicitSkillsScope = (basePath: string): boolean =>
  basePath === '.agents/skills' || basePath.startsWith('.agents/skills/');

/**
 * Every file below `basePath` the index holds, or `undefined` when the walk
 * must answer: no index, a skills scope (overlay entries are not indexed), or
 * a directory the index does not hold.
 *
 * @param fileSystem - The handler's filesystem.
 * @param basePath - Canonical directory; `''` is the project root.
 * @returns Project-relative file rows, or `undefined`.
 */
export const indexedFilesUnder = async (
  fileSystem: RpcFileSystem,
  basePath: string,
): Promise<readonly RpcIndexedFile[] | undefined> => {
  if (fileSystem.indexedFiles === undefined || isExplicitSkillsScope(basePath)) {
    return undefined;
  }
  /* A host whose index cannot answer resolves nothing; the walk does. */
  return (await fileSystem.indexedFiles(basePath)) ?? undefined;
};

/** One file a walk found, with what its listing said about it. */
export type WalkedFile = RpcIndexedFile;

/**
 * Walk a directory through `readdir`, the path a host without an index takes.
 * An unscoped walk skips a directory composed above the project (N9).
 *
 * @param fileSystem - The handler's filesystem.
 * @param basePath - Canonical directory.
 * @param options - Whether the listings measure content facts, and whether overlay directories are entered.
 * @returns Every file found, in walk order.
 */
export const walkFiles = async (
  fileSystem: RpcFileSystem,
  basePath: string,
  options: Readonly<{ contentFacts: boolean; includeExplicitOnly: boolean }>,
): Promise<WalkedFile[]> => {
  const files: WalkedFile[] = [];
  const entries = options.contentFacts
    ? await fileSystem.readdir(basePath)
    : await fileSystem.readdir(basePath, { contentFacts: false });
  for (const entry of entries) {
    const path = joinRelativePath(basePath, entry.name);
    if (entry.type === 'file') {
      files.push({
        path,
        size: entry.size,
        ...listedFileMetadataFields(entry),
        ...(entry.modifiedAt === undefined ? {} : { modifiedAt: entry.modifiedAt }),
      });
    } else if (options.includeExplicitOnly || entry.traverseOnImplicitSearch !== false) {
      // oxlint-disable-next-line no-await-in-loop -- recursive traversal
      files.push(...(await walkFiles(fileSystem, path, options)));
    }
  }
  return files;
};

/**
 * The content kinds the host can tell for files the index has not measured,
 * from each file's head at most (D4). A host that cannot say tells nothing.
 *
 * @param fileSystem - The handler's filesystem.
 * @param paths - Files whose kind is unknown.
 * @returns Each kind the host told.
 */
export const contentKindsOf = async (
  fileSystem: RpcFileSystem,
  paths: readonly string[],
): Promise<ReadonlyMap<string, 'text' | 'binary'>> =>
  paths.length === 0 || fileSystem.contentKinds === undefined ? new Map() : fileSystem.contentKinds(paths);
