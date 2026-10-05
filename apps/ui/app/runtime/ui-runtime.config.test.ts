import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import type { RuntimeConfigInput } from '@taucad/runtime/worker';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { debugRuntime, runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';

const tauApiUrlEnvironmentKey = 'TAU_API_URL';
const tauWebSocketUrlEnvironmentKey = 'TAU_WEBSOCKET_URL';

afterEach(() => vi.unstubAllGlobals());

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

  it('selects the same immutable custom single pair for normal and debug Node workers', async () => {
    vi.stubGlobal('location', { href: 'https://app.tau.test/assets/runtime-worker.js' });
    // Actual public input bytes; this does not claim browser fetch/worker initialization before a product run.
    const orderedAssets = await Promise.all(
      ['replicad_single.wasm', 'replicad_single.mjs'].map(
        async (name) =>
          `sha256:${createHash('sha256')
            .update(await readFile(join(process.cwd(), 'public/assets/engines/replicad/density-single-v1', name)))
            .digest('hex')}`,
      ),
    );
    expect(orderedAssets).toEqual([
      'sha256:9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9',
      'sha256:cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27',
    ]);
    const assetUrl = (name: string): string =>
      pathToFileURL(join(process.cwd(), 'public/assets/engines/replicad/density-single-v1', name)).href;
    for (const definition of [runtime, debugRuntime]) {
      // eslint-disable-next-line no-await-in-loop -- Verify each definition's resolved engine pair independently.
      const resolvedRuntime = await resolveRuntimeDefinition(definition, {
        tauApiUrl: 'https://api.tau.test',
        tauWebSocketUrl: 'wss://api.tau.test',
      });
      expect(resolvedRuntime.kernels.find((kernel) => kernel.id === 'replicad')?.options).toMatchObject({
        wasm: {
          wasmUrl: assetUrl('replicad_single.wasm'),
          wasmBindingsUrl: assetUrl('replicad_single.mjs'),
        },
        withSourceMapping: definition === debugRuntime,
      });
    }
  });

  it('selects the browser asset URLs when the runtime definition is imported without Node detection', async () => {
    const nodeProcess = process;
    vi.stubGlobal('location', new URL('https://app.tau.test/assets/runtime-worker.js'));
    vi.stubGlobal('process', { ...nodeProcess, versions: { ...nodeProcess.versions, node: undefined } });
    vi.resetModules();
    const { runtime: browserRuntime, debugRuntime: browserDebugRuntime } =
      await import('#runtime/ui-runtime.definition.js');
    vi.stubGlobal('process', nodeProcess);
    for (const definition of [browserRuntime, browserDebugRuntime]) {
      // eslint-disable-next-line no-await-in-loop -- Verify both independently instantiated definitions.
      const resolvedRuntime = await resolveRuntimeDefinition(definition, {
        tauApiUrl: 'https://api.tau.test',
        tauWebSocketUrl: 'wss://api.tau.test',
      });
      expect(resolvedRuntime.kernels.find((kernel) => kernel.id === 'replicad')?.options).toMatchObject({
        wasm: {
          wasmUrl: 'https://app.tau.test/assets/engines/replicad/density-single-v1/replicad_single.wasm',
          wasmBindingsUrl: 'https://app.tau.test/assets/engines/replicad/density-single-v1/replicad_single.mjs',
        },
        withSourceMapping: definition === browserDebugRuntime,
      });
    }
  });
});
