import { createRuntimeClient } from '@taucad/runtime/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { HeadlessImageBackend } from '#services/headless-image.service.js';

/** SVG and GLB execute in one lifecycle-owned scratch utility, without a renderer GPU probe. */
export const headlessImageBackend: HeadlessImageBackend = {
  async createImageClient() {
    const options = await createElectronClientOptions<typeof runtime>({
      config: createUiRuntimeConfig(ENV),
      context: { purpose: 'ephemeral', definition: 'default' },
    })();
    const client = createRuntimeClient(options);
    const adapter: Awaited<ReturnType<HeadlessImageBackend['createImageClient']>> = {
      connect: async () => client.connect(),
      terminate: () => {
        client.terminate();
      },
      on: (event, handler) => client.on(event, handler),
      transcode: async (input) => client.transcode(input),
    };
    return adapter;
  },
};
