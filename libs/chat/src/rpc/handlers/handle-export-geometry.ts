import type { ExportGeometryRpcInput, ExportGeometryRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcFileSystem, RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { writeArtifactSet } from '#rpc/handlers/write-artifact.js';

export async function handleExportGeometry(
  input: ExportGeometryRpcInput,
  graphics: RpcGraphicsClient | undefined,
  fileSystem: RpcFileSystem,
): Promise<ExportGeometryRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted',
    };
  }

  const result = await graphics.exportGeometry({ targetFile: input.targetFile, format: input.format });

  if (!result.success) {
    return result;
  }

  const files = await writeArtifactSet(
    {
      toolCallId: input.toolCallId,
      targetFile: input.targetFile,
      format: input.format,
      files: result.files,
    },
    fileSystem,
  );

  if (!files) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'Failed to persist export artifact to the project filesystem',
    };
  }

  return {
    success: true,
    format: input.format,
    files,
  };
}
