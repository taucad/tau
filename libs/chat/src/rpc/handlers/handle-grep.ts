import type { GrepRpcInput, GrepRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';

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

async function collectFilePaths(
  fileSystem: RpcFileSystem,
  basePath: string,
  includeExplicitOnly: boolean,
): Promise<string[]> {
  const paths: string[] = [];
  /* Grep reads every file it finds, which already measures it: the walk needs names and types only. */
  const entries = await fileSystem.readdir(basePath, { contentFacts: false });

  for (const entry of entries) {
    const fullPath = joinRelativePath(basePath, entry.name);
    if (entry.type === 'file') {
      paths.push(fullPath);
    } else if (includeExplicitOnly || entry.traverseOnImplicitSearch !== false) {
      // oxlint-disable-next-line no-await-in-loop -- recursive traversal
      const subPaths = await collectFilePaths(fileSystem, fullPath, includeExplicitOnly);
      paths.push(...subPaths);
    }
  }

  return paths;
}

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
  return new Set(await fileSystem.pendingPaths(paths));
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

async function resolveSearchPaths(fileSystem: RpcFileSystem, basePath: string): Promise<string[]> {
  // Stat first so we can distinguish file vs directory and emit a clean
  // FILE_NOT_FOUND when the caller types a wrong path (no thrown
  // `Grep search failed` exception, mirrors claude-code's GrepTool.validateInput).
  if (basePath === '') {
    return collectFilePaths(fileSystem, '', false);
  }
  const stat = await fileSystem.stat(basePath);
  const explicitlyScopedToSkills = basePath === '.agents/skills' || basePath.startsWith('.agents/skills/');
  return stat.isDirectory ? collectFilePaths(fileSystem, basePath, explicitlyScopedToSkills) : [basePath];
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
    try {
      filesToSearch = await resolveSearchPaths(fileSystem, basePath);
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

    if (input.glob) {
      const { minimatch } = await import('minimatch');
      filesToSearch = filesToSearch.filter((path) => minimatch(path, input.glob!, { matchBase: true, dot: true }));
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
    };
  } catch (error) {
    return toRpcError(error);
  }
}
