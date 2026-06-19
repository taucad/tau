import { describe, expect, it } from 'vitest';
import type { RuntimeConfigInput } from '@taucad/runtime/worker';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';

const tauApiUrlEnvironmentKey = 'TAU_API_URL';
const tauWebSocketUrlEnvironmentKey = 'TAU_WEBSOCKET_URL';

describe('createUiRuntimeConfig', () => {
  it('should return the typed UI runtime config parsed from page environment values', () => {
    const config = createUiRuntimeConfig({
      [tauApiUrlEnvironmentKey]: 'https://api.tau.test',
      [tauWebSocketUrlEnvironmentKey]: 'wss://api.tau.test',
    });

    expect(config).toEqual({
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    } satisfies RuntimeConfigInput<typeof runtime>);
    expect(uiRuntimeConfigSchema.parse(config)).toEqual(config);
  });

  it('should reject missing runtime URLs before worker construction', () => {
    const invalidEnvironment = {
      [tauApiUrlEnvironmentKey]: undefined,
      [tauWebSocketUrlEnvironmentKey]: undefined,
    } as unknown as Parameters<typeof createUiRuntimeConfig>[0];

    try {
      createUiRuntimeConfig(invalidEnvironment);
      expect.fail('should reject missing runtime URLs');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('tauApiUrl');
      expect((error as Error).message).toContain('tauWebSocketUrl');
    }
  });
});
