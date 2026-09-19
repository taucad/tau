import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

const createEphemeralClientOptions = () =>
  createElectronClientOptions<typeof runtime>({
    config: createUiRuntimeConfig(ENV),
    context: { purpose: 'ephemeral', definition: 'default' },
  });

export const heroClientOptions = createEphemeralClientOptions();
export const qrClientOptions = createEphemeralClientOptions();
export const gearClientOptions = createEphemeralClientOptions();
export const splashClientOptions = createEphemeralClientOptions();
