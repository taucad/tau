import { createRuntimeClient } from '@taucad/runtime/client';
import type { RuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { usdzRuntime } from '#runtime/usdz-runtime.definition.js';

/** Create the browser's isolated USDZ transcoder, whose caller owns its lifetime. */
export const createUsdzClient = async (): Promise<RuntimeClient<typeof usdzRuntime>> =>
  createRuntimeClient<typeof usdzRuntime>({
    transport: webWorkerTransport({
      createWorker: () =>
        new Worker(new URL('usdz-runtime.worker.ts', import.meta.url), {
          name: 'tau-ar-usdz-transcoder-worker',
          type: 'module',
        }),
      fileSystem: fromMemoryFs(),
    }),
  });
