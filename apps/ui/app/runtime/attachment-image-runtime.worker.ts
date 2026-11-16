import { createRuntimeWorker } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { attachmentImageRuntime } from '#runtime/attachment-image-runtime.definition.js';

await webWorkerHost({ worker: createRuntimeWorker({ runtime: attachmentImageRuntime }) }).open();
