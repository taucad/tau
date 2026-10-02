import type { EvaluateModelRpcInput, EvaluateModelRpcResult } from '#schemas/rpc.schema.js';
import type { RpcInvocationContext, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';

/** @public */
export async function handleEvaluateModel(
  input: EvaluateModelRpcInput,
  kernelClient: RpcRuntimeClient,
  context?: RpcInvocationContext,
): Promise<EvaluateModelRpcResult> {
  context?.signal?.throwIfAborted();
  const result = await kernelClient.evaluateModel(input, context);
  context?.signal?.throwIfAborted();
  return result;
}
