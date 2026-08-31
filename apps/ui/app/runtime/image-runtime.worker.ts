import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { imageRuntime } from '#runtime/image-runtime.definition.js';

await webWorkerHost({ worker: createRuntimeWorker({ runtime: imageRuntime }) }).open();
