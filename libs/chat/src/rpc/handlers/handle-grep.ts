import type { GrepRpcInput, GrepRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';

/**
 * Default `headLimit` when the caller omits one. Mirrors claude-code's
 * `GrepTool` pattern (small head + explicit override) — dense `.d.ts`/lockfile
 * greps trip the offload threshold at far fewer matches than ripgrep's 250.
 */
const defaultGrepHeadLimit = 50;

/**
 * Per-match-line character cap. Lines exceeding this are replaced with
 * `[line truncated: N chars]`, preserving `file`/`line` metadata.
 * Equivalent to ripgrep's `--max-columns 500` (claude-code uses the same).
 */
const maxGrepLineChars = 500;

async function collectFilePaths(fileSystem: RpcFileSystem, basePath: string): Promise<string[]> {
  const paths: string[] = [];
  const entries = await fileSystem.readdir(basePath);

  for (const entry of entries) {
    const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.type === 'file') {
      paths.push(fullPath);
    } else {
      // oxlint-disable-next-line no-await-in-loop -- recursive traversal
      const subPaths = await collectFilePaths(fileSystem, fullPath);
      paths.push(...subPaths);
    }
  }

  return paths;
}

type GrepMatch = { file: string; line: number; content: string };

function truncateMatchLine(line: string): string {
  return line.length > maxGrepLineChars ? `[line truncated: ${line.length} chars]` : line;
}

async function resolveSearchPaths(fileSystem: RpcFileSystem, basePath: string): Promise<string[]> {
  // Stat first so we can distinguish file vs directory and emit a clean
  // FILE_NOT_FOUND when the caller types a wrong path (no thrown
  // `Grep search failed` exception, mirrors claude-code's GrepTool.validateInput).
  if (basePath === '') {
    return collectFilePaths(fileSystem, '');
  }
  const stat = await fileSystem.stat(basePath);
  return stat.isDirectory ? collectFilePaths(fileSystem, basePath) : [basePath];
}

/** @public */
export async function handleGrep(input: GrepRpcInput, fileSystem: RpcFileSystem): Promise<GrepRpcResult> {
  const headLimit = input.headLimit ?? defaultGrepHeadLimit;
  const offset = input.offset ?? 0;

  try {
    const regex = new RegExp(input.pattern, input.caseSensitive === false ? 'gi' : 'g');
    const basePath = input.path ?? '';

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
      filesToSearch = filesToSearch.filter((path) => minimatch(path, input.glob!, { matchBase: true }));
    }

    const searchPromises = filesToSearch.map(async (filePath) => {
      try {
        const text = await fileSystem.readFile(filePath);
        const lines = text.split('\n');
        const fileMatches: GrepMatch[] = [];

        for (const [lineIndex, line] of lines.entries()) {
          if (line && regex.test(line)) {
            fileMatches.push({
              file: filePath,
              line: lineIndex + 1,
              content: truncateMatchLine(line),
            });
          }

          regex.lastIndex = 0;
        }

        return fileMatches;
      } catch {
        return [];
      }
    });

    const allFileMatches = await Promise.all(searchPromises);
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
    };
  } catch (error) {
    return toRpcError(error);
  }
}
