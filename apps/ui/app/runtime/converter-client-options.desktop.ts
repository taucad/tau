import { createRuntimeClient } from '@taucad/runtime/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import type { ConverterRuntimeClient } from '@taucad/converter/runtime';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

const provideConverterClientOptions = createElectronClientOptions<typeof runtime>({
  config: createUiRuntimeConfig(ENV),
  context: { purpose: 'ephemeral', definition: 'default' },
});

export const createConverterClient = async (): Promise<ConverterRuntimeClient> =>
  createRuntimeClient(await provideConverterClientOptions()) as ConverterRuntimeClient;
