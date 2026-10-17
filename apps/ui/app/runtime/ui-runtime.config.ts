import type { RuntimeConfigInput } from '@taucad/runtime/worker';
import type { Environment } from '#environment.config.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';

export type UiRuntimeConfigInput = RuntimeConfigInput<typeof runtime>;

type UiRuntimeEnvironment = Pick<Environment, 'TAU_ACQUISITION' | 'TAU_API_URL' | 'TAU_WEBSOCKET_URL'>;

type UiRuntimeDevice = Readonly<{ memoryConstrained: boolean }>;

/**
 * Build the runtime config a page hands its runtime worker.
 *
 * @param environment - The page environment values.
 * @param device - The page's device memory class; read from the page by default.
 * @returns The parsed runtime config.
 */
export const createUiRuntimeConfig = (
  environment: UiRuntimeEnvironment,
  device?: UiRuntimeDevice,
): UiRuntimeConfigInput =>
  uiRuntimeConfigSchema.parse({
    tauApiUrl: environment.TAU_API_URL,
    tauWebSocketUrl: environment.TAU_WEBSOCKET_URL,
    acquisition: environment.TAU_ACQUISITION,
    memoryConstrained: device?.memoryConstrained ?? isMemoryConstrainedDevice(),
  });
