import type { EditFileRpcInput, EditFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';

/** @public */
export async function handleEditFile(input: EditFileRpcInput, fileSystem: RpcFileSystem): Promise<EditFileRpcResult> {
  try {
    const targetFile = assertRootedPath(input.targetFile);
    const result = await fileSystem.editFile(targetFile, input.oldString, input.newString, input.replaceAll);
    const { diffStats } = result as Partial<typeof result>;
    if (!diffStats) {
      throw new Error('Deterministic editFile implementations must return diffStats.');
    }

    return {
      success: true,
      message: `Replaced ${result.occurrences} occurrence${result.occurrences === 1 ? '' : 's'} in ${targetFile}`,
      occurrences: result.occurrences,
      ...(result.staleRecovered ? { staleRecovered: true } : {}),
      diffStats,
    };
  } catch (error) {
    return { ...toRpcError(error), retryable: true };
  }
}
