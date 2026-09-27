import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RunGeoSpecTestsRpcInput, RunGeoSpecTestsRpcResult } from '#schemas/rpc.schema.js';
import type { RpcGeoSpecClient, RpcInvocationContext } from '#rpc/rpc-dependencies.js';

/** @public */
export async function handleRunGeoSpecTests(
  input: RunGeoSpecTestsRpcInput,
  geospec: RpcGeoSpecClient | undefined,
  context?: RpcInvocationContext,
): Promise<RunGeoSpecTestsRpcResult> {
  context?.signal?.throwIfAborted();
  if (!geospec) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'GeoSpec tests require a browser-connected Tau runner.',
    };
  }

  const result = await geospec.runTests(input, context);
  context?.signal?.throwIfAborted();
  return result;
}
