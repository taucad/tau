import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type {
  ApplyParameterOperationRpcInput,
  ApplyParameterOperationRpcResult,
  GetParametersRpcInput,
  GetParametersRpcResult,
} from '#schemas/rpc.schema.js';
import type { RpcInvocationContext, RpcHandlerError, RpcParameterClient } from '#rpc/rpc-dependencies.js';

const unavailable = (message: string): RpcHandlerError => ({
  success: false,
  errorCode: rpcClientErrorCode.contextNotFound,
  message,
});

/** Dispatch a semantic parameter read through the host's shared authority client. @public */
export async function handleGetParameters(
  input: GetParametersRpcInput,
  parameters: RpcParameterClient | undefined,
  context?: RpcInvocationContext,
): Promise<GetParametersRpcResult> {
  context?.signal?.throwIfAborted();
  if (!parameters) {
    return unavailable('This host has no parameter authority attached.');
  }
  const result = await parameters.getParameters(input, context);
  context?.signal?.throwIfAborted();
  return result;
}

/** Dispatch one checked parameter operation and preserve its complete business outcome. @public */
export async function handleApplyParameterOperation(
  input: ApplyParameterOperationRpcInput,
  parameters: RpcParameterClient | undefined,
  context?: RpcInvocationContext,
): Promise<ApplyParameterOperationRpcResult> {
  context?.signal?.throwIfAborted();
  if (!parameters) {
    return unavailable('This host has no parameter authority attached.');
  }
  const result = await parameters.applyParameterOperation(input, context);
  return result;
}
