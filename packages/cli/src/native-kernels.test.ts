import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  composeNativeKernels,
  nativeKernelFor,
  nativePreparationPlugins,
  openNativePreparation,
  refusedKernels,
} from '#native-kernels.js';

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

  it('should compose every declared kernel as unavailable on a cold store, with the bytes preparing downloads', async () => {
    vi.stubEnv('TAU_PAYLOAD_TARGET', 'linux-x64-glibc');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const plugins = await nativePreparationPlugins();
    const build123d = plugins.find((plugin) => plugin.package === '@taucad/build123d');
    const variant = build123d?.deployment.dependencies['engine']?.find(
      ({ target }) => target.runtime === 'native' && target.os === 'linux' && target.arch === 'x64',
    );
    const expectedBytes = (variant?.payloads ?? []).reduce((sum, payload) => sum + payload.byteLength, 0);

    const composition = await composeNativeKernels();

    expect(expectedBytes).toBeGreaterThan(0);
    expect(composition).not.toHaveProperty('build123d');
    expect(composition.unavailable).toEqual([
      {
        kernel: 'build123d',
        package: '@taucad/build123d',
        extensions: ['py'],
        reason: 'not-prepared',
        byteLength: expectedBytes,
      },
      expect.objectContaining({ kernel: 'picogk', extensions: ['cs'], reason: 'unsupported-target', byteLength: 0 }),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    const entries = await readdir(configDirectory, { recursive: true });
    expect(entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'))).toEqual([]);
  });

  it('should find the refused kernels wherever a tool result carries its issues', () => {
    const issue = (kernel: string) => ({ code: 'KERNEL_NOT_PREPARED', details: { kernel } });

    expect(refusedKernels({ status: 'error', kernelIssues: [issue('build123d')] })).toEqual(new Set(['build123d']));
    expect(refusedKernels({ failures: [{ reason: { issues: [issue('picogk'), issue('build123d')] } }] })).toEqual(
      new Set(['picogk', 'build123d']),
    );
    expect(refusedKernels({ kernelIssues: [{ code: 'KERNEL_CAPABILITY_MISSING', details: { kernel: 'x' } }] })).toEqual(
      new Set(),
    );
    expect(refusedKernels('KERNEL_NOT_PREPARED')).toEqual(new Set());
  });

  it('should refuse to prepare an unknown kernel, naming the kernels that can be prepared', async () => {
    const preparation = openNativePreparation({
      fetch: async () => {
        throw new Error('no request expected');
      },
    });
    try {
      await expect(preparation.prepare('nope', { signal: new AbortController().signal })).rejects.toMatchObject({
        code: 'UNKNOWN_KERNEL',
        message: "No native kernel is called 'nope'. Kernels that can be prepared: build123d, picogk.",
      });
    } finally {
      await preparation.dispose();
    }
  });
});
