import type { EditFileRpcInput, EditFileRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';
import { assertRootedPath } from '@taucad/utils/path';
import { sha256String } from '@taucad/utils/hash';

/** @public */
export async function handleEditFile(input: EditFileRpcInput, fileSystem: RpcFileSystem): Promise<EditFileRpcResult> {
  try {
    const targetFile = assertRootedPath(input.targetFile);
    const result = await fileSystem.editFile({ ...input, targetFile });
    const { diffStats } = result as Partial<typeof result>;
    if (!diffStats) {
      throw new Error('Deterministic editFile implementations must return diffStats.');
    }
    if (input.expectedDigest !== undefined && result.digest === undefined) {
      throw new Error('Reviewed editFile implementations must prove the committed byte digest.');
    }

    return {
      success: true,
      message: `Replaced ${result.occurrences} occurrence${result.occurrences === 1 ? '' : 's'} in ${targetFile}`,
      occurrences: result.occurrences,
      ...(result.staleRecovered ? { staleRecovered: true } : {}),
      diffStats,
      // R4: the digest of the bytes this edit left at the path, not of the replacement text.
      revision: {
        path: targetFile,
        digest: result.digest ?? `sha256:${await sha256String(diffStats.modifiedContent)}`,
      },
    };
  } catch (error) {
    return input.expectedDigest === undefined ? { ...toRpcError(error), retryable: true } : toRpcError(error);
  }
}
