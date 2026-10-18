import { describe, expect, it } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import type { RuntimeConfigInput } from '@taucad/runtime/worker';
import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
import { kernelConfigurations } from '@taucad/types/constants';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';

const tauApiUrlEnvironmentKey = 'TAU_API_URL';
const tauWebSocketUrlEnvironmentKey = 'TAU_WEBSOCKET_URL';
const tauAcquisitionEnvironmentKey = 'TAU_ACQUISITION';

describe('createUiRuntimeConfig', () => {
  it('should return the typed UI runtime config parsed from page environment values', () => {
    const config = createUiRuntimeConfig({
      [tauApiUrlEnvironmentKey]: 'https://api.tau.test',
      [tauWebSocketUrlEnvironmentKey]: 'wss://api.tau.test',
      [tauAcquisitionEnvironmentKey]: 'open',
    });

    expect(config).toEqual({
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
      acquisition: 'open',
      memoryConstrained: false,
    } satisfies RuntimeConfigInput<typeof runtime>);
    expect(uiRuntimeConfigSchema.parse(config)).toEqual(config);
  });

  it('should reject missing runtime URLs before worker construction', () => {
    const invalidEnvironment = {
      [tauApiUrlEnvironmentKey]: undefined,
      [tauWebSocketUrlEnvironmentKey]: undefined,
      [tauAcquisitionEnvironmentKey]: 'open',
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

  it('should cover the product catalog, leaving the native kernels to the desktop runtime', async () => {
    assertKernelRosterCoverage({
      runtime: await resolveRuntimeDefinition(runtime, {
        tauApiUrl: 'https://api.tau.test',
        tauWebSocketUrl: 'wss://api.tau.test',
      }),
      catalog: kernelConfigurations,
      omitted: {
        build123d: 'native: a browser cannot run a sandboxed CPython; the desktop runtime lists build123d()',
        picogk: 'native: a browser cannot run the .NET worker; the desktop runtime lists picogk()',
      },
    });
  });

  it('routes runtime observability to the configured Tau API', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    });

    expect(resolvedRuntime.middleware[0]).toMatchObject({
      id: 'observability',
      options: { reportUrl: 'https://api.tau.test/v1/telemetry/ingest' },
    });
  });

  it('should hand the locked acquisition profile to the in-browser bundler', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(
      runtime,
      createUiRuntimeConfig({
        [tauApiUrlEnvironmentKey]: 'https://api.tau.test',
        [tauWebSocketUrlEnvironmentKey]: 'wss://api.tau.test',
        [tauAcquisitionEnvironmentKey]: 'locked',
      }),
    );

    expect(resolvedRuntime.bundlers.find(({ id }) => id === 'esbuild')).toMatchObject({
      options: { acquisition: 'locked' },
    });
  });

  it('should keep the open profile when the environment sets none', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    });

    expect(resolvedRuntime.bundlers.find(({ id }) => id === 'esbuild')).toMatchObject({
      options: { acquisition: 'open' },
    });
  });

  it('should carry the page device memory class into the runtime config', () => {
    const environment = {
      [tauApiUrlEnvironmentKey]: 'https://api.tau.test',
      [tauWebSocketUrlEnvironmentKey]: 'wss://api.tau.test',
      [tauAcquisitionEnvironmentKey]: 'open',
    } as const;

    expect(createUiRuntimeConfig(environment, { memoryConstrained: true })).toMatchObject({ memoryConstrained: true });
    expect(createUiRuntimeConfig(environment, { memoryConstrained: false })).toMatchObject({
      memoryConstrained: false,
    });
  });

  // D-RT-04: the pthread builds reserve a 4 GiB shared memory, spawn a worker per core with 8 MiB stacks, and cost
  // +124 MB WASM and +4 workers at load on the iPhone profile.
  it('should select the single-threaded OCCT and PicoVoxel builds on a memory-constrained device', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
      memoryConstrained: true,
    });
    const kernelOptions = (id: string) => resolvedRuntime.kernels.find((kernel) => kernel.id === id)?.options;

    expect(kernelOptions('replicad')).toMatchObject({ wasm: 'single' });
    // OpenCascade defaults to its single-threaded 'full' build; nothing may ask for 'multi' or 'auto' here.
    expect(kernelOptions('opencascade')?.['wasm'] ?? 'full').toBe('full');
    expect(kernelOptions('picovoxel')).toMatchObject({ wasm: 'serial' });
  });

  it('should keep the automatic build choice on a standard device', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    });
    const kernelOptions = (id: string) => resolvedRuntime.kernels.find((kernel) => kernel.id === id)?.options;

    expect(kernelOptions('replicad')).toMatchObject({ wasm: 'auto' });
    expect(kernelOptions('picovoxel')?.['wasm']).not.toBe('serial');
  });

  // D-RT-01: replicad's semantic reuse keeps serialized BRep per operation (measured ~10 MB per edit on the iPhone
  // profile); a phone renders without it until its resident bound is qualified there.
  it('should turn replicad compute reuse off on a memory-constrained device only', async () => {
    const replicadOptions = async (memoryConstrained: boolean) => {
      const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
        tauApiUrl: 'https://api.tau.test',
        tauWebSocketUrl: 'wss://api.tau.test',
        memoryConstrained,
      });
      return resolvedRuntime.kernels.find((kernel) => kernel.id === 'replicad')?.options;
    };

    expect(await replicadOptions(true)).toMatchObject({ computeReuse: false });
    const standard = await replicadOptions(false);
    expect(standard?.['computeReuse']).toBeUndefined();
  });

  // D-RT-05 / D-GFX-10: a 2,000,000-triangle preview costs ~230 MiB steady on a phone and over 1 GiB with Section.
  it('should give previews the phone triangle budget and PicoVoxel the phone recycle threshold on a memory-constrained device', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
      memoryConstrained: true,
    });
    const kernelOptions = (id: string) => resolvedRuntime.kernels.find((kernel) => kernel.id === id)?.options;

    expect(kernelOptions('replicad')).toMatchObject({ previewTriangleBudget: 400_000 });
    expect(kernelOptions('opencascade')).toMatchObject({ previewTriangleBudget: 400_000 });
    expect(resolvedRuntime.middleware.find(({ id }) => id === 'displaySimplification')).toMatchObject({
      options: { maxTriangles: 400_000 },
    });
    expect(kernelOptions('picovoxel')).toMatchObject({ recycleHeapBytes: 512 * 2 ** 20 });
  });

  it('should keep the policy preview budgets on a standard device', async () => {
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    });
    const kernelOptions = (id: string) => resolvedRuntime.kernels.find((kernel) => kernel.id === id)?.options;

    expect(kernelOptions('replicad')?.['previewTriangleBudget']).toBeUndefined();
    expect(kernelOptions('opencascade')?.['previewTriangleBudget']).toBeUndefined();
  });
});
