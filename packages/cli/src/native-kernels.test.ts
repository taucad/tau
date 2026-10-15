import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeKernelFor, nativePreparationPlugins } from '#native-kernels.js';

describe('native kernels from the payload store', () => {
  let configDirectory: string;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'tau-native-kernels-'));
    vi.stubEnv('TAU_CONFIG_DIR', configDirectory);
    vi.stubEnv('TAU_ACQUISITION', '');
    vi.stubEnv('TAU_PAYLOAD_DIR', '');
    vi.stubEnv('TAU_PAYLOAD_MIRROR', '');
    vi.stubEnv('TAU_PAYLOAD_TARGET', '');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(configDirectory, { recursive: true, force: true });
  });

  it('should give Build123d its seal step in the preparation roster', async () => {
    const plugins = await nativePreparationPlugins();
    const build123d = plugins.find((plugin) => plugin.package === '@taucad/build123d');
    const picogk = plugins.find((plugin) => plugin.package === '@taucad/picogk');

    expect(build123d?.deployment.kernels).toHaveProperty('build123d');
    expect(build123d?.seal).toBeTypeOf('function');
    expect(picogk).not.toHaveProperty('seal');
  });

  it('should refuse an unprepared Build123d model with the command that prepares it, downloading nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const refusal = await nativeKernelFor('py');

    expect(refusal).toEqual({
      code: 'KERNEL_NOT_PREPARED',
      message:
        'The build123d kernel is not prepared on this machine. Run `tau prepare build123d` once, then export again.',
    });
    expect(JSON.stringify(refusal)).not.toContain('--plugin');
    expect(fetchSpy).not.toHaveBeenCalled();
    const entries = await readdir(configDirectory, { recursive: true });
    expect(entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'))).toEqual([]);
  });

  it('should refuse a model whose kernel declares no variant for the forced target', async () => {
    vi.stubEnv('TAU_PAYLOAD_TARGET', 'win32-x64');

    await expect(nativeKernelFor('py')).resolves.toMatchObject({ code: 'UNSUPPORTED_TARGET' });
  });

  it('should reject a malformed managed profile as a usage error', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'not-a-profile');

    await expect(nativeKernelFor('py')).rejects.toMatchObject({ code: 'MANAGED_PROFILE_INVALID', exit: 2 });
  });

  it('should leave the store alone for an input no native kernel handles', async () => {
    await expect(nativeKernelFor('scad')).resolves.toBeUndefined();
  });
});
