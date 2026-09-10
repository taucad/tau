import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

export const ephemeralKernelOptions: LazyKernelOptionsFactory = async () => {
  const provideClientOptions = createElectronClientOptions<typeof runtime>({
    config: createUiRuntimeConfig(ENV),
    context: { purpose: 'ephemeral', definition: 'default' },
  });
  const clientOptions = await provideClientOptions();
  return () => clientOptions;
};
