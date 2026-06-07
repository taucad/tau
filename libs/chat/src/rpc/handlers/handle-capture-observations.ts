import type { CaptureObservationsRpcInput, CaptureObservationsRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcGraphicsClient } from '#rpc/rpc-dependencies.js';

/** @public */
export async function handleCaptureObservations(
  input: CaptureObservationsRpcInput,
  graphics: RpcGraphicsClient | undefined,
): Promise<CaptureObservationsRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted for screenshots',
    };
  }

  return graphics.captureObservations({
    targetFile: input.targetFile,
  });
}
