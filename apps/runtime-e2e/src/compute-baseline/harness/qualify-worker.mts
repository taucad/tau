/**
 * Worker entry for qualification arms that need a real worker thread (`--transport worker`): the stop-latency
 * case cannot run in-process, because the model's synchronous `main()` blocks the thread that would supersede it.
 * Options come from the environment the arm process sets (worker threads share it).
 */
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker } from '@taucad/runtime/worker';
import { qualifyPhaseChannel, qualifyRuntime } from './qualify-runtime.mts';

// With `devtoolsTelemetry`, the tracer mirrors each span into `performance.measure` the moment it ends, as
// `tau:<span>:<epoch>:<id>`. Posting the span name from there tells the arm process that the next phase has begun
// while the worker is still busy with it. A plain worker never calls `measure`, so nothing is posted.
const phaseEnds = new BroadcastChannel(qualifyPhaseChannel);
(phaseEnds as unknown as { unref?: () => void }).unref?.();
const measure = performance.measure.bind(performance);
performance.measure = ((name: string, ...rest: unknown[]) => {
  if (name.startsWith('tau:')) phaseEnds.postMessage({ span: name.split(':')[1] });
  return (measure as (...args: unknown[]) => PerformanceMeasure)(name, ...rest);
}) as typeof performance.measure;

const runtime = await qualifyRuntime({
  arm: process.env['TAU_QUALIFY_ARM'] ?? 'off',
  wasm: (process.env['TAU_QUALIFY_WASM'] ?? 'single') as 'single' | 'multi' | 'auto',
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
