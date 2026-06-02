import type { FetchGeometryRpcInput, FetchGeometryRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcFileSystem, RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { writeArtifact } from '#rpc/handlers/write-artifact.js';

export async function handleFetchGeometry(
  input: FetchGeometryRpcInput,
  graphics: RpcGraphicsClient | undefined,
  fileSystem: RpcFileSystem,
): Promise<FetchGeometryRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted',
    };
  }

  const result = await graphics.fetchGeometry({ targetFile: input.targetFile, parameters: input.parameters });

  if (!result.success || !input.artifactId) {
    return result;
  }

  const artifactPath = await writeArtifact(
    {
      toolCallId: input.artifactId,
      targetFile: input.targetFile,
      extension: 'glb',
      bytes: result.glb,
    },
    fileSystem,
  );

  return { ...result, artifactPath };
}
