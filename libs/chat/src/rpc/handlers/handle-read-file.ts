import type { ReadFileRpcInput, ReadFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

export async function handleReadFile(input: ReadFileRpcInput, fileSystem: RpcFileSystem): Promise<ReadFileRpcResult> {
  try {
    const text = await fileSystem.readFile(input.targetFile);
    const lines = text.split('\n');
    const totalLines = lines.length;

    const offset: number = input.offset ?? 1;
    const limit: number = input.limit ?? lines.length;
    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(lines.length, startIndex + limit);
    const selectedLines = lines.slice(startIndex, endIndex);

    const content = selectedLines.join('\n');

    return { success: true, content, totalLines, startLine: startIndex + 1 };
  } catch (error) {
    return toRpcError(error);
  }
}
