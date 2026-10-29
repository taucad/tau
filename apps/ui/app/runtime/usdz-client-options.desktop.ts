import { createRuntimeClient } from '@taucad/runtime/client';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

/** Transcode the viewer's GLB in an ephemeral native utility, never in the renderer. */
export const createUsdzClient = async (): Promise<RuntimeClient<typeof runtime>> => {
  const options = await createElectronClientOptions<typeof runtime>({
    config: createUiRuntimeConfig(ENV),
    context: { purpose: 'ephemeral', definition: 'default' },
  })();
  return createRuntimeClient(options);
};
