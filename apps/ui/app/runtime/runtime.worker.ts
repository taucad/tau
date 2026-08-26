import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { runtime } from '#runtime/ui-runtime.definition.js';

const worker = createRuntimeWorker({
  runtime,
});

await webWorkerHost({ worker }).open();
