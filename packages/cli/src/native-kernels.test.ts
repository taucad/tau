import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nativePreparationPlugins, preparedBuild123d, unpreparedNativeKernel } from '#native-kernels.js';

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

  it('should list Build123d with its seal step in the preparation roster', async () => {
    const plugins = await nativePreparationPlugins();
    const build123d = plugins.find((plugin) => plugin.package === '@taucad/build123d');

    expect(build123d?.deployment.kernels).toHaveProperty('build123d');
    expect(build123d?.seal).toBeTypeOf('function');
  });

  it('should compose no Build123d kernel from an empty store, downloading nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(preparedBuild123d()).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    const entries = await readdir(configDirectory, { recursive: true });
    expect(entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'))).toEqual([]);
  });

  it('should compose no Build123d kernel when the managed profile is invalid', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'not-a-profile');

    await expect(preparedBuild123d()).resolves.toBeUndefined();
  });

  it('should refuse a Build123d model as not prepared, naming the prepare command', async () => {
    const refusal = await unpreparedNativeKernel('py');

    expect(refusal).toEqual({
      code: 'KERNEL_NOT_PREPARED',
      message:
        'The build123d kernel is not prepared on this machine. Run `tau prepare build123d` once, then export again.',
    });
    expect(refusal?.message).not.toContain('--plugin');
  });

  it('should refuse a model whose kernel declares no variant for the forced target', async () => {
    vi.stubEnv('TAU_PAYLOAD_TARGET', 'win32-x64');

    await expect(unpreparedNativeKernel('py')).resolves.toMatchObject({ code: 'UNSUPPORTED_TARGET' });
  });

  it('should leave an input no native kernel handles to the runtime', async () => {
    await expect(unpreparedNativeKernel('scad')).resolves.toBeUndefined();
  });
});
