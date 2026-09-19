import type { CaptureImagesRpcInput, CaptureImagesRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcImageClient, RpcInvocationContext } from '#rpc/rpc-dependencies.js';

/** Dispatch deterministic image capture without requiring a mounted viewport. @public */
export async function handleCaptureImages(
  input: CaptureImagesRpcInput,
  images: RpcImageClient | undefined,
  context?: RpcInvocationContext,
): Promise<CaptureImagesRpcResult> {
  context?.signal?.throwIfAborted();
  if (!images) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'Headless image capture is unavailable',
    };
  }

  const result = await images.captureImages(input, context);
  context?.signal?.throwIfAborted();
  return result;
}
