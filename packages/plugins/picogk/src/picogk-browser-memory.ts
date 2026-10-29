import { z } from 'zod';

/** Default idle recycling threshold, matching Tau's standard device policy. @internal */
export const defaultPicogkRecycleHeapBytes = 1.5 * 2 ** 30;

const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const resultSchema = z.looseObject({
  metrics: z.record(z.string(), z.unknown()),
  recycleAfterResponse: z.boolean(),
});

/**
 * Sample the actual WebAssembly heap and request recycling after artifact delivery.
 * @param result - Managed build response, including its existing recycling decision.
 * @param heapBytes - Current Emscripten heap size, including native and managed allocations.
 * @param recycleHeapBytes - Host device policy; this is an idle recycle threshold, not a model size limit.
 * @returns A response that preserves the scene and original artifact receipts.
 * @internal
 */
export const withPicogkBrowserMemory = (
  result: unknown,
  heapBytes: number,
  recycleHeapBytes: number,
): z.output<typeof resultSchema> & { metrics: Record<string, unknown> & { wasmHeapBytes: number } } => {
  bytes.parse(heapBytes);
  bytes.positive().parse(recycleHeapBytes);
  const build = resultSchema.parse(result);
  return {
    ...build,
    metrics: { ...build.metrics, wasmHeapBytes: heapBytes },
    recycleAfterResponse: build.recycleAfterResponse || heapBytes > recycleHeapBytes,
  };
};
