import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { converterRuntime } from '#routes/convert/converter-runtime.definition.js';

await webWorkerHost({ worker: createRuntimeWorker({ runtime: converterRuntime }) }).open();
