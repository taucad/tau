import type { CaptureImagesRpcInput, CaptureImagesRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcImageClient } from '#rpc/rpc-dependencies.js';

/** Dispatch deterministic image capture without requiring a mounted viewport. @public */
export async function handleCaptureImages(
  input: CaptureImagesRpcInput,
  images: RpcImageClient | undefined,
): Promise<CaptureImagesRpcResult> {
  if (!images) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'Headless image capture is unavailable',
    };
  }

  return images.captureImages(input);
}
