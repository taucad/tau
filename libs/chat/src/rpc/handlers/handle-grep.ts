import type { GrepRpcInput, GrepRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

const maxMatches = 100;

async function collectFilePaths(fileSystem: RpcFileSystem, basePath: string): Promise<string[]> {
  const paths: string[] = [];
  const entries = await fileSystem.readdir(basePath);

  for (const entry of entries) {
    const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.type === 'file') {
      paths.push(fullPath);
    } else {
      // eslint-disable-next-line no-await-in-loop -- recursive traversal
      const subPaths = await collectFilePaths(fileSystem, fullPath);
      paths.push(...subPaths);
    }
  }

  return paths;
}

export async function handleGrep(input: GrepRpcInput, fileSystem: RpcFileSystem): Promise<GrepRpcResult> {
  const matches: Array<{ file: string; line: number; content: string }> = [];

  try {
    const regex = new RegExp(input.pattern, input.caseSensitive === false ? 'gi' : 'g');
    const basePath = input.path ?? '';

    const allFiles = await collectFilePaths(fileSystem, basePath);
    let filesToSearch = allFiles;

    if (input.glob) {
      const { minimatch } = await import('minimatch');
      filesToSearch = allFiles.filter((path) => minimatch(path, input.glob!, { matchBase: true }));
    }

    const searchPromises = filesToSearch.map(async (filePath) => {
      try {
        const text = await fileSystem.readFile(filePath);
        const lines = text.split('\n');
        const fileMatches: Array<{ file: string; line: number; content: string }> = [];

        for (const [lineIndex, line] of lines.entries()) {
          if (line && regex.test(line)) {
            fileMatches.push({
              file: filePath,
              line: lineIndex + 1,
              content: line,
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

    let totalMatches = 0;
    for (const fileMatches of allFileMatches) {
      totalMatches += fileMatches.length;
    }

    for (const fileMatches of allFileMatches) {
      for (const match of fileMatches) {
        if (matches.length < maxMatches) {
          matches.push(match);
        }
      }
    }

    return {
      success: true,
      matches,
      totalMatches,
      truncated: totalMatches > maxMatches,
    };
  } catch (error) {
    return toRpcError(error);
  }
}
