import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { converterRuntime, ConverterRuntimeClient } from '@taucad/converter/runtime';
import { observeRuntimeClient } from '#telemetry/runtime-telemetry.js';

export const createConverterClient = async (): Promise<ConverterRuntimeClient> => {
  const client = createRuntimeClient<typeof converterRuntime>({
    transport: webWorkerTransport({
      fileSystem: fromMemoryFs(),
      createWorker: () =>
        new Worker(new URL('../routes/convert/converter-runtime.worker.ts', import.meta.url), {
          name: 'tau-converter-runtime-worker',
          type: 'module',
        }),
    }),
  });
  /* Runtime observability (FR-14): held weakly by the page, so a client the converter drops is not kept alive. */
  observeRuntimeClient(client, 'converter');
  return client;
};
