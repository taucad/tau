import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { admitAssemblyDisplay } from '#runtime/assembly-display-admission.js';
import { debugRuntime } from '#runtime/ui-runtime.definition.js';

const worker = createRuntimeWorker({
  runtime: debugRuntime,
  admitAssemblyDisplay,
});

await webWorkerHost({ worker }).open();
