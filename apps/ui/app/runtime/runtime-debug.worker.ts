import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { debugRuntime } from '#runtime/ui-runtime.definition.js';

const worker = createRuntimeWorker({
  runtime: debugRuntime,
});

await webWorkerHost({ worker }).open();
