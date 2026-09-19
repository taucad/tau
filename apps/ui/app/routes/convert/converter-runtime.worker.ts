import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { converterRuntime } from '@taucad/converter/runtime';

await webWorkerHost({ worker: createRuntimeWorker({ runtime: converterRuntime }) }).open();
