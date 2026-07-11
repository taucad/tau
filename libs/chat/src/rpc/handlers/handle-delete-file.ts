import type { DeleteFileRpcInput, DeleteFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

/** @public */
export async function handleDeleteFile(
  input: DeleteFileRpcInput,
  fileSystem: RpcFileSystem,
): Promise<DeleteFileRpcResult> {
  try {
    // Capture pre-deletion content so restore can reconstruct the file (R7).
    // Reading here keeps the delete a single RPC round-trip (no extra read_file
    // call). Missing/binary/unreadable files yield no diffStats; the delete
    // still succeeds.
    let originalContent: string | undefined;
    try {
      originalContent = await fileSystem.readFile(input.targetFile);
    } catch {
      originalContent = undefined;
    }

    await fileSystem.deleteFile(input.targetFile);

    return {
      success: true,
      message: `File deleted: ${input.targetFile}`,
      diffStats:
        originalContent === undefined
          ? undefined
          : {
              linesAdded: 0,
              linesRemoved: originalContent.split('\n').length,
              originalContent,
              modifiedContent: '',
            },
    };
  } catch (error) {
    return toRpcError(error);
  }
}
