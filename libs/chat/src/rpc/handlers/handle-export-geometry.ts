import type { ExportGeometryRpcInput, ExportGeometryRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcDependencies, RpcInvocationContext } from '#rpc/rpc-dependencies.js';
import { writeArtifactSet } from '#rpc/handlers/write-artifact.js';

export async function handleExportGeometry(
  input: ExportGeometryRpcInput,
  dependencies: Pick<RpcDependencies, 'graphics' | 'fileSystem'>,
  context?: RpcInvocationContext,
): Promise<ExportGeometryRpcResult> {
  context?.signal?.throwIfAborted();
  const { graphics, fileSystem } = dependencies;
  if (!graphics) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted',
    };
  }

  const result = await graphics.exportGeometry(
    {
      targetFile: input.targetFile,
      format: input.format,
      ...(input.exportOptions === undefined ? {} : { exportOptions: input.exportOptions }),
    },
    context,
  );
  context?.signal?.throwIfAborted();

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
  context?.signal?.throwIfAborted();

  if (!files) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'Failed to persist export artifact to the project filesystem',
    };
  }

  /* A transcoder can succeed with less than was asked, such as one colour for a multi-colour model; the agent must hear it. */
  const warnings = result.issues?.filter((issue) => issue.severity === 'warning') ?? [];
  return {
    success: true,
    format: input.format,
    files,
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}
