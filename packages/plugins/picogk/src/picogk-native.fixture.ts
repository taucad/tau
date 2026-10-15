// The native suites' kernel options: the PicoGK closure prepared offline from the layer `picogk:prepare-layer` built
// and the seed it staged, launched through Microsoft's `dotnet` muxer exactly as `tau prepare picogk` would (D6).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPreparationHost, parsePluginDeployment } from '@taucad/runtime/preparation/node';

import { picogkOptionsFromClosure } from '#picogk-closure.js';
import { composeManifest, picogkLayerRecordSchema } from '#picogk-layer.js';
import type { PicogkClosureOptions } from '#picogk-closure.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const layerRoot = resolve(workspaceRoot, 'out/picogk-layer');
const layerRecord = resolve(layerRoot, 'darwin-arm64/tau-layer.json');

const prepareClosure = async (): Promise<PicogkClosureOptions> => {
  if (!existsSync(layerRecord)) {
    throw new Error(`${layerRecord} is missing; run \`pnpm nx run picogk:prepare-layer\` first.`);
  }
  const record = picogkLayerRecordSchema.parse(JSON.parse(readFileSync(layerRecord, 'utf8')));
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const deployment = parsePluginDeployment(composeManifest(manifest, record), 'picogk native test manifest');
  const host = createPreparationHost({
    plugins: [{ package: '@taucad/picogk', deployment }],
    store: resolve(workspaceRoot, 'out/cache/picogk/store'),
    seed: resolve(layerRoot, 'seed'),
  });
  const outcome = await host.prepare({
    package: '@taucad/picogk',
    offline: true,
    signal: new AbortController().signal,
  });
  const receipt = outcome.status === 'ready' ? outcome.receipts['runtime'] : undefined;
  if (receipt === undefined) {
    throw new Error(`Preparing the PicoGK test closure ended ${JSON.stringify(outcome)}.`);
  }
  return picogkOptionsFromClosure(receipt);
};

/**
 * Whether the native engine can run here. Upstream PicoGK ships no Linux voxel library and Tau builds the engine for
 * darwin-arm64 only, so every other host skips the native suites until a Linux engine builder exists (D13).
 */
export const nativeEngineAvailable = process.platform === 'darwin' && process.arch === 'arm64';

/**
 * Kernel options for the prepared closure; on a host that skips the native suites, schema-valid options that name no
 * file, so the suites still define their runtimes and launch nothing.
 */
export const nativeKernelOptions: PicogkClosureOptions = nativeEngineAvailable
  ? await prepareClosure()
  : {
      ...picogkOptionsSchema.parse({
        workerExecutable: resolve(layerRoot, 'unavailable/dotnet/dotnet'),
        workerSha256: '0'.repeat(64),
        resourceFiles: [
          {
            path: resolve(layerRoot, 'unavailable/tau-worker/PicoGK.dll'),
            sha256: '0'.repeat(64),
            label: 'unavailable',
          },
        ],
      }),
      runtimePath: resolve(layerRoot, 'unavailable'),
      workerArguments: [],
    };
