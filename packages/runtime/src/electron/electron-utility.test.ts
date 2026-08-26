import { describe, expect, it, vi } from 'vitest';

import { defineRuntime } from '#worker/index.js';
import { fromMemoryFs } from '#filesystem/index.js';
import type * as RuntimeHostModule from '#host/create-runtime-host.js';
import type * as ElectronUtilityModule from '#electron/utility.js';

vi.mock('#host/create-runtime-host.js', () => ({
  createRuntimeHost: vi.fn(() => ({ dispose: vi.fn(), id: 'electron-utility-host' })),
}));

describe('Electron utility runtime helper', () => {
  it('creates a runtime host from a worker-owned runtime and transport filesystem', async () => {
    const hostModule: typeof RuntimeHostModule = await import('#host/create-runtime-host.js');
    const utilityModule: typeof ElectronUtilityModule = await import('#electron/utility.js');
    const runtime = defineRuntime({ kernels: [] });
    const sourcePath = '/main.scad';

    const host = utilityModule.serveElectronRuntime({
      fileSystem: fromMemoryFs({ [sourcePath]: 'cube(10);' }),
      installProcessTeardown: false,
      runtime,
    });

    expect(host).toMatchObject({ id: 'electron-utility-host' });
    const createRuntimeHost = vi.mocked(hostModule.createRuntimeHost);
    expect(createRuntimeHost).toHaveBeenCalledTimes(1);
    expect(createRuntimeHost.mock.calls[0]?.[0].transport.id).toBe('electron-utility');
  });
});
