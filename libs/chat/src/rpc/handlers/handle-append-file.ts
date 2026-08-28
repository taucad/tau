import type { AppendFileRpcInput, AppendFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';

const textEncoder = new TextEncoder();

/** @public */
export async function handleAppendFile(
  input: AppendFileRpcInput,
  fileSystem: RpcFileSystem,
): Promise<AppendFileRpcResult> {
  try {
    const targetFile = assertRootedPath(input.targetFile);
    await fileSystem.appendFile(targetFile, input.content);

    const bytesWritten = textEncoder.encode(input.content).byteLength;

    return {
      success: true,
      message: `Appended ${bytesWritten} bytes to ${targetFile}`,
      bytesWritten,
    };
  } catch (error) {
    return toRpcError(error);
  }
}
