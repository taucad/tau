import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { usdzRuntime } from '#runtime/usdz-runtime.definition.js';

await webWorkerHost({ worker: createRuntimeWorker({ runtime: usdzRuntime }) }).open();
