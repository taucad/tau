import type { CreateFileRpcInput, CreateFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';

/** @public */
export async function handleCreateFile(
  input: CreateFileRpcInput,
  fileSystem: RpcFileSystem,
): Promise<CreateFileRpcResult> {
  try {
    const targetFile = assertRootedPath(input.targetFile);
    const existed = await fileSystem.exists(targetFile);
    const originalContent = existed ? await fileSystem.readFile(targetFile) : '';

    await fileSystem.writeFile(targetFile, input.content);
    return {
      success: true,
      message: `File created: ${targetFile}`,
      diffStats: {
        linesAdded: input.content.split('\n').length,
        linesRemoved: existed ? originalContent.split('\n').length : 0,
        originalContent,
        modifiedContent: input.content,
      },
    };
  } catch (error) {
    return toRpcError(error);
  }
}
