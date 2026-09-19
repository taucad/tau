import type { GetKernelResultRpcInput, GetKernelResultRpcResult } from '#schemas/rpc.schema.js';
import type { RpcInvocationContext, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';

/** @public */
export async function handleGetKernelResult(
  input: GetKernelResultRpcInput,
  kernelClient: RpcRuntimeClient,
  context?: RpcInvocationContext,
): Promise<GetKernelResultRpcResult> {
  context?.signal?.throwIfAborted();
  const result = await kernelClient.getKernelResult(input.targetFile, context);
  context?.signal?.throwIfAborted();
  return result;
}
