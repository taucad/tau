import type { RunGeoSpecTestsRpcInput, RunGeoSpecTestsRpcResult } from '#schemas/rpc.schema.js';
import type { RpcGeoSpecClient } from '#rpc/rpc-dependencies.js';

/** @public */
export async function handleRunGeoSpecTests(
  input: RunGeoSpecTestsRpcInput,
  geospec: RpcGeoSpecClient | undefined,
): Promise<RunGeoSpecTestsRpcResult> {
  if (!geospec) {
    return {
      success: false,
      errorCode: 'UNKNOWN',
      message: 'GeoSpec tests require a browser-connected Tau runner.',
    };
  }

  return geospec.runTests(input);
}
