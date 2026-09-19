import { createRuntimeClient } from '@taucad/runtime/client';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { converterRuntime, ConverterRuntimeClient } from '@taucad/converter/runtime';

export const createConverterClient = async (): Promise<ConverterRuntimeClient> =>
  createRuntimeClient<typeof converterRuntime>({
    transport: webWorkerTransport({
      createWorker: () =>
        new Worker(new URL('../routes/convert/converter-runtime.worker.ts', import.meta.url), {
          name: 'tau-converter-runtime-worker',
          type: 'module',
        }),
    }),
  });
