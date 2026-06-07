import type { CaptureScreenshotRpcInput, CaptureScreenshotRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcGraphicsClient } from '#rpc/rpc-dependencies.js';

export async function handleCaptureScreenshot(
  input: CaptureScreenshotRpcInput,
  graphics: RpcGraphicsClient | undefined,
): Promise<CaptureScreenshotRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted for screenshots',
    };
  }

  return graphics.captureScreenshot({
    targetFile: input.targetFile,
  });
}
