import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromMemoryFs } from '@taucad/runtime/filesystem';

const mocks = vi.hoisted(() => {
  const tauApiUrlEnvironmentKey = 'TAU_API_URL';
  const tauWebSocketUrlEnvironmentKey = 'TAU_WEBSOCKET_URL';
  return {
    environment: {
      [tauApiUrlEnvironmentKey]: 'https://api.tau.test',
      [tauWebSocketUrlEnvironmentKey]: 'wss://api.tau.test',
    },
    runtimeConfig: {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    },
    createUiRuntimeConfig: vi.fn(),
    createDefaultKernelOptions: vi.fn(),
    createDebugKernelOptions: vi.fn(),
  };
});

vi.mock('#environment.config.js', () => {
  const environmentExportKey = 'ENV';
  return {
    [environmentExportKey]: mocks.environment,
  };
});

vi.mock('#runtime/ui-runtime.config.js', () => ({
  createUiRuntimeConfig: mocks.createUiRuntimeConfig,
}));

vi.mock('#constants/kernel-worker.constants.js', () => ({
  createDefaultKernelOptions: mocks.createDefaultKernelOptions,
  createDebugKernelOptions: mocks.createDebugKernelOptions,
}));

describe('kernel option presets', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createUiRuntimeConfig.mockReset();
    mocks.createDefaultKernelOptions.mockReset();
    mocks.createDebugKernelOptions.mockReset();
  });

  it('should derive runtime config from page environment before creating default runtime options', async () => {
    mocks.createUiRuntimeConfig.mockReturnValue(mocks.runtimeConfig);
    mocks.createDefaultKernelOptions.mockReturnValue({ config: mocks.runtimeConfig });
    const { defaultKernelOptions } = await import('#constants/kernel-options.presets.js');

    const buildOptions = await defaultKernelOptions();
    const deps: Parameters<typeof buildOptions>[0] = {
      fileSystem: fromMemoryFs(),
    };
    const options = buildOptions(deps);

    expect(mocks.createUiRuntimeConfig).toHaveBeenCalledWith(mocks.environment);
    expect(mocks.createDefaultKernelOptions).toHaveBeenCalledWith({
      ...deps,
      runtimeConfig: mocks.runtimeConfig,
    });
    expect(options).toEqual({ config: mocks.runtimeConfig });
  });

  it('should derive runtime config from page environment before creating debug runtime options', async () => {
    mocks.createUiRuntimeConfig.mockReturnValue(mocks.runtimeConfig);
    mocks.createDebugKernelOptions.mockReturnValue({ config: mocks.runtimeConfig });
    const { debugKernelOptions } = await import('#constants/kernel-options.presets.js');

    const buildOptions = await debugKernelOptions();
    const deps: Parameters<typeof buildOptions>[0] = { fileSystem: fromMemoryFs() };
    const options = buildOptions(deps);

    expect(mocks.createUiRuntimeConfig).toHaveBeenCalledWith(mocks.environment);
    expect(mocks.createDebugKernelOptions).toHaveBeenCalledWith({
      ...deps,
      runtimeConfig: mocks.runtimeConfig,
    });
    expect(options).toEqual({ config: mocks.runtimeConfig });
  });
});
