import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { zoo } from '@taucad/zoo';
import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';
import { z } from 'zod';

export const runtime = defineRuntime({
  configSchema: z.object({
    tauWebSocketUrl: z.string().url(),
  }),
  createRuntime(config) {
    return {
      plugins: [zoo({ kernels: { default: { baseUrl: `${config.tauWebSocketUrl}/v1/kernels/zoo` } } }), esbuild()],
    };
  },
});

await serveWebWorkerRuntime({ runtime });
