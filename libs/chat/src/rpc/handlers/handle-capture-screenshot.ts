import type { CaptureScreenshotRpcInput, CaptureScreenshotRpcResult } from '#schemas/rpc.schema.js';
import type { RpcGraphicsClient } from '#rpc/rpc-dependencies.js';

export async function handleCaptureScreenshot(
  _input: CaptureScreenshotRpcInput,
  graphics: RpcGraphicsClient | undefined,
): Promise<CaptureScreenshotRpcResult> {
  if (!graphics) {
    return {
      success: false,
      errorCode: 'UNKNOWN',
      message: 'No graphics view is currently mounted for screenshots',
    };
  }

  return graphics.captureScreenshot();
}
