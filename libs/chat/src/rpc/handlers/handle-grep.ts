import type { GrepRpcInput, GrepRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';
import { getErrno } from '@taucad/utils/error';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { contentKindsOf, indexedFilesUnder, isExplicitSkillsScope, walkFiles } from '#rpc/search-files.js';

/**
 * Default `headLimit` when the caller omits one. Mirrors claude-code's
 * `GrepTool` pattern (small head + explicit override) — dense `.d.ts`/lockfile
 * greps trip the offload threshold at far fewer matches than ripgrep's 250.
 */
const defaultGrepHeadLimit = 50;

/**
 * Per-match-line character cap. Lines exceeding this retain their first 500
 * characters, preserving useful match context and `file`/`line` metadata.
 * Equivalent to ripgrep's `--max-columns 500` (claude-code uses the same).
 */
const maxGrepLineChars = 500;

/**
 * Largest file a directory grep reads (charter D13): a larger one is generated
 * output or data, not source, and its bytes would become one string. The same
 * default as the authority's own `grep`. The result names each file left
 * unread, and a file named as the grep's path is always read.
 */
const maxGrepFileBytes = 4 * 1024 * 1024;

type GrepMatch = { file: string; line: number; content: string; before?: string[]; after?: string[] };

/* A file whose large object has not reached the device (the authority's `PENDING`) was not searched, so it is named rather than counted as no matches. */
const isPending = (error: unknown): boolean => (error as { code?: unknown } | undefined)?.code === 'PENDING';

/** How many files one grep reads at once. */
const grepReadConcurrency = 16;

/*
 * The files the index already knows are pending (D9): asked before any read, so
 * a grep never starts a download. A host that cannot say is asked nothing, and
 * its reads answer `PENDING` instead; a host whose index fails to answer fails
 * the grep, which reading every file would turn into downloads.
 */
const knownPending = async (fileSystem: RpcFileSystem, paths: readonly string[]): Promise<ReadonlySet<string>> => {
  if (fileSystem.pendingPaths === undefined || paths.length === 0) {
    return new Set();
  }
  try {
    return new Set(await fileSystem.pendingPaths(paths));
  } catch (error) {
    /* A relayed host that predates the call cannot say either (the UI's `pendingPathsUnsupportedCode`). */
    if (getErrno(error) === 'PENDING_PATHS_UNSUPPORTED') {
      return new Set();
    }
    throw error;
  }
};

/* Map over items with at most `limit` in flight, keeping the input order. */
const mapBounded = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- one read at a time per worker bounds the reads in flight.
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

function truncateMatchLine(line: string): string {
  return line.slice(0, maxGrepLineChars);
}

/** A glob over project-relative paths: a pattern without `/` matches a basename at any depth. */
const globFilter = async (glob: string): Promise<(path: string) => boolean> => {
  const { minimatch } = await import('minimatch');
  return (path) => minimatch(path, glob, { matchBase: true, dot: true });
};

/**
 * The files one grep reads, and the files it leaves unread for their size.
 * The index answers a directory's subtree in one call; without one, or for a
 * directory it does not hold, the directory is walked. Either way every file
 * known to be binary or above the size cap is left unread, and a file whose
 * kind is not known is classified from its head (D4) before any read. A file
 * named as the grep's path is always read.
 */
async function resolveSearchFiles(
  fileSystem: RpcFileSystem,
  basePath: string,
  glob: string | undefined,
): Promise<Readonly<{ files: string[]; oversized: string[] }>> {
  // Stat first so we can distinguish file vs directory and emit a clean
  // FILE_NOT_FOUND when the caller types a wrong path (no thrown
  // `Grep search failed` exception, mirrors claude-code's GrepTool.validateInput).
  const matchesGlob = glob ? await globFilter(glob) : undefined;
  if (basePath !== '') {
    const stat = await fileSystem.stat(basePath);
    if (!stat.isDirectory) {
      return { files: matchesGlob?.(basePath) === false ? [] : [basePath], oversized: [] };
    }
  }
  const listed =
    (await indexedFilesUnder(fileSystem, basePath)) ??
    (await walkFiles(fileSystem, basePath, {
      contentFacts: false,
      includeExplicitOnly: isExplicitSkillsScope(basePath),
    }));
  const searchable = listed.filter((file) => file.contentKind !== 'binary' && matchesGlob?.(file.path) !== false);
  const oversized = searchable.filter((file) => file.size > maxGrepFileBytes).map(({ path }) => path);
  const candidates = searchable.filter((file) => file.size <= maxGrepFileBytes);
  const kinds = await contentKindsOf(
    fileSystem,
    candidates.filter((file) => file.contentKind === undefined).map((file) => file.path),
  );
  return {
    files: candidates.filter((file) => (file.contentKind ?? kinds.get(file.path)) !== 'binary').map(({ path }) => path),
    oversized,
  };
}

/** @public */
export async function handleGrep(input: GrepRpcInput, fileSystem: RpcFileSystem): Promise<GrepRpcResult> {
  const headLimit = input.headLimit ?? defaultGrepHeadLimit;
  const offset = input.offset ?? 0;
  const context = input.context ?? 0;

  try {
    const regex = new RegExp(input.pattern, input.caseSensitive === false ? 'gi' : 'g');
    const basePath = assertRootedPath(input.path ?? '');

    let filesToSearch: string[];
    let oversizedFiles: string[];
    try {
      ({ files: filesToSearch, oversized: oversizedFiles } = await resolveSearchFiles(
        fileSystem,
        basePath,
        input.glob,
      ));
    } catch (error) {
      const errno = (error as NodeJS.ErrnoException | undefined)?.code;
      if (errno === 'ENOENT' || (error instanceof Error && /enoent|no such/i.test(error.message))) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.fileNotFound,
          message: `Path does not exist: ${basePath}`,
        };
      }
      throw error;
    }

    const pending = new Set<string>(await knownPending(fileSystem, filesToSearch));
    const searchFile = async (filePath: string): Promise<GrepMatch[]> => {
      if (pending.has(filePath)) {
        return [];
      }
      try {
        const text = await fileSystem.readFile(filePath);
        const lines = text.split('\n');
        if (lines.at(-1) === '') {
          lines.pop();
        }
        const fileMatches: GrepMatch[] = [];

        for (const [lineIndex, line] of lines.entries()) {
          if (line && regex.test(line)) {
            fileMatches.push({
              file: filePath,
              line: lineIndex + 1,
              content: truncateMatchLine(line),
              // ponytail: adjacent matches repeat shared context lines; merge ranges if that output size matters.
              ...(context > 0
                ? {
                    before: lines
                      .slice(Math.max(0, lineIndex - context), lineIndex)
                      .map((contextLine) => truncateMatchLine(contextLine)),
                    after: lines
                      .slice(lineIndex + 1, lineIndex + 1 + context)
                      .map((contextLine) => truncateMatchLine(contextLine)),
                  }
                : {}),
            });
          }

          regex.lastIndex = 0;
        }

        return fileMatches;
      } catch (error) {
        if (isPending(error)) {
          pending.add(filePath);
        }
        return [];
      }
    };

    const allFileMatches = await mapBounded(filesToSearch, grepReadConcurrency, searchFile);
    const flatMatches: GrepMatch[] = [];
    for (const fileMatches of allFileMatches) {
      flatMatches.push(...fileMatches);
    }
    const totalMatches = flatMatches.length;
    const matches = flatMatches.slice(offset, offset + headLimit);

    return {
      success: true,
      matches,
      totalMatches,
      truncated: totalMatches > offset + headLimit,
      appliedHeadLimit: headLimit,
      appliedOffset: offset,
      /* In the walk's order. */
      ...(pending.size === 0 ? {} : { pendingFiles: filesToSearch.filter((path) => pending.has(path)) }),
      ...(oversizedFiles.length === 0 ? {} : { oversizedFiles }),
    };
  } catch (error) {
    return toRpcError(error);
  }
}
