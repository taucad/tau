import type { AttachmentImageBackend } from '#services/attachment-image.service.js';
import { load } from '#lib/code-loading.js';
import { createModuleWorker } from '#lib/module-worker.js';

/**
 * Browser conversion: a dedicated module worker running the raster-only attachment runtime. Everything is imported on
 * the first conversion, so neither the worker chunk nor any codec reaches the entry's static import graph. Replaced at
 * module resolution in desktop builds.
 */
export const attachmentImageBackend: AttachmentImageBackend = {
  async createClient() {
    const [{ createRuntimeClient }, { webWorkerTransport }, { fromMemoryFs }, { observeRuntimeClient }] =
      await Promise.all([
        load(async () => import('@taucad/runtime/client')),
        load(async () => import('@taucad/runtime/transport/web')),
        load(async () => import('@taucad/runtime/filesystem')),
        load(async () => import('#telemetry/runtime-telemetry.js')),
      ]);
    const client = createRuntimeClient({
      transport: webWorkerTransport({
        createWorker: () =>
          createModuleWorker(
            () =>
              new Worker(new URL('../runtime/attachment-image-runtime.worker.ts', import.meta.url), {
                name: 'tau-attachment-image-worker',
                type: 'module',
              }),
            { name: 'attachment-image' },
          ),
        fileSystem: fromMemoryFs(),
      }),
    });
    /* Runtime observability (FR-14): conversion attempts, attached before `connect()`. */
    const stopObserving = observeRuntimeClient(client, 'attachment');
    return {
      connect: async () => client.connect(),
      setTranscodeTimeout: (milliseconds) => {
        client.setTranscodeTimeout(milliseconds);
      },
      transcode: client.transcode.bind(client),
      terminate: () => {
        client.terminate();
        stopObserving();
      },
    };
  },
};
