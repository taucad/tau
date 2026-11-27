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
//
// The abort scenario also hands over a gate: `[0]` names the span to hold at (1 `kernel.execute`, 2
// `replicad.render-output`), `[1]` is set once the arm has issued its supersede. Holding there for that one span makes
// the supersede land exactly as the next phase starts, whatever this machine's speed and however short the phase.
const phaseEnds = new BroadcastChannel(qualifyPhaseChannel);
(phaseEnds as unknown as { unref?: () => void }).unref?.();
const gatedSpans = ['', 'kernel.execute', 'replicad.render-output'];
let gate: Int32Array | undefined;
phaseEnds.onmessage = ({ data }: MessageEvent<{ gate?: SharedArrayBuffer }>) => {
  if (data.gate) {
    gate = new Int32Array(data.gate);
    phaseEnds.postMessage({ ready: true });
  }
};
const measure = performance.measure.bind(performance);
performance.measure = ((name: string, ...rest: unknown[]) => {
  if (name.startsWith('tau:')) {
    const span = name.split(':')[1]!;
    phaseEnds.postMessage({ span });
    if (gate && Atomics.load(gate, 0) !== 0 && gatedSpans[Atomics.load(gate, 0)] === span) {
      Atomics.store(gate, 0, 0);
      // Bounded, so a lost arm process cannot hold the worker for good.
      const woke = Atomics.wait(gate, 1, 0, 10_000);
      phaseEnds.postMessage({ released: { span, woke } });
    }
  }
  return (measure as (...args: unknown[]) => PerformanceMeasure)(name, ...rest);
}) as typeof performance.measure;

const runtime = await qualifyRuntime({
  arm: process.env['TAU_QUALIFY_ARM'] ?? 'off',
  wasm: (process.env['TAU_QUALIFY_WASM'] ?? 'single') as 'single' | 'multi' | 'auto',
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
