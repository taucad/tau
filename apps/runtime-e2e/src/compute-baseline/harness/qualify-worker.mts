/**
 * Worker entry for qualification arms that need a real worker thread (`--transport worker`): the stop-latency
 * case cannot run in-process, because the model's synchronous `main()` blocks the thread that would supersede it.
 * Options come from the environment the arm process sets (worker threads share it).
 */
import { nodeWorkerHost } from '../../../../../packages/runtime/src/transport/node.ts';
import { createRuntimeWorker } from '../../../../../packages/runtime/src/worker/index.ts';
import { qualifyRuntime } from './qualify-runtime.mts';

const runtime = await qualifyRuntime({
  arm: process.env['TAU_QUALIFY_ARM'] ?? 'off',
  wasm: (process.env['TAU_QUALIFY_WASM'] ?? 'single') as 'single' | 'multi' | 'auto',
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
