import type { CreateFileRpcInput, CreateFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

/** @public */
export async function handleCreateFile(
  input: CreateFileRpcInput,
  fileSystem: RpcFileSystem,
): Promise<CreateFileRpcResult> {
  try {
    // Capture prior content when overwriting an existing file so the overwrite
    // is invertible for restore (R7). A genuine new file reverts to absent, so
    // its originalContent stays '' and linesRemoved 0.
    const existed = await fileSystem.exists(input.targetFile);
    const originalContent = existed ? await fileSystem.readFile(input.targetFile) : '';

    await fileSystem.writeFile(input.targetFile, input.content);

    return {
      success: true,
      message: `File created: ${input.targetFile}`,
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
