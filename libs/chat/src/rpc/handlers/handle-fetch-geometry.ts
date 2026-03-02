import type { FetchGeometryRpcInput, FetchGeometryRpcResult } from '#schemas/rpc.schema.js';
import type { RpcFileSystem, RpcGraphicsClient } from '#rpc/rpc-dependencies.js';

const artifactsDirectory = '.tau/artifacts';

export async function handleFetchGeometry(
  input: FetchGeometryRpcInput,
  graphics: RpcGraphicsClient | undefined,
  fileSystem: RpcFileSystem,
): Promise<FetchGeometryRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: 'UNKNOWN',
      message: 'No graphics view is currently mounted',
    };
  }

  const result = await graphics.fetchGeometry();

  if (!result.success || !input.artifactId) {
    return result;
  }

  const artifactPath = `${artifactsDirectory}/${input.artifactId}.glb`;

  try {
    await fileSystem.writeBinaryFile(artifactPath, result.glb);
    return { ...result, artifactPath };
  } catch {
    return { ...result, artifactPath: undefined };
  }
}
