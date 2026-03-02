import type { GlobSearchRpcInput, GlobSearchRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

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

export async function handleGlobSearch(
  input: GlobSearchRpcInput,
  fileSystem: RpcFileSystem,
): Promise<GlobSearchRpcResult> {
  try {
    const basePath = input.path ?? '';
    const allFiles = await collectFilePaths(fileSystem, basePath);

    const { minimatch } = await import('minimatch');
    const files = allFiles.filter((path) => minimatch(path, input.pattern, { matchBase: true }));

    return { success: true, files, totalFiles: files.length };
  } catch (error) {
    return toRpcError(error);
  }
}
