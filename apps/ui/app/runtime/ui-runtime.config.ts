import type { RuntimeConfigInput } from '@taucad/runtime/worker';
import type { Environment } from '#environment.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';

export type UiRuntimeConfigInput = RuntimeConfigInput<typeof runtime>;

type UiRuntimeEnvironment = Pick<Environment, 'TAU_API_URL' | 'TAU_WEBSOCKET_URL'>;

export const createUiRuntimeConfig = (environment: UiRuntimeEnvironment): UiRuntimeConfigInput =>
  uiRuntimeConfigSchema.parse({
    tauApiUrl: environment.TAU_API_URL,
    tauWebSocketUrl: environment.TAU_WEBSOCKET_URL,
  });
