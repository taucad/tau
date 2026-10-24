// The native suites' kernel options, launched through Microsoft's `dotnet` muxer exactly as `tau prepare picogk` would
// (D6). Two sources: by default the closure prepared offline from the layer `picogk:prepare-layer` (darwin-arm64) or
// `picogk:prepare-layer-linux` (linux-x64) built and the seed it staged, so a change to the worker is tested from its
// own build; with `TAU_PICOGK_CLOSURE=pinned` (the `test:native-darwin` and `test:native-linux` targets, charter D30)
// the checked-in manifest's own closure, downloaded from its pinned origins (Microsoft's runtime and the published Tau
// layer) into a dedicated store, with no native build.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPreparationHost, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type { ClosureReceipt } from '@taucad/runtime/preparation/node';

import { picogkLaunchSet, picogkOptionsFromClosure } from '#picogk-closure.js';
import { composeManifest, picogkLayerRecordSchema } from '#picogk-layer.js';
import type { PicogkClosureOptions } from '#picogk-closure.js';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const layerRoot = resolve(workspaceRoot, 'out/picogk-layer');
/** This host as a layer target, when Tau builds the layer for it. */
const hostTarget = ['darwin-arm64', 'linux-x64'].find((target) => target === `${process.platform}-${process.arch}`);
const layerRecord = resolve(layerRoot, `${hostTarget ?? 'unavailable'}/tau-layer.json`);
const stagedVariants = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../tau-plugin.variants.json'), 'utf8'),
) as Record<string, unknown>;

/** Whether the suites run the checked-in manifest's pinned closure instead of the locally built layer. */
export const pinnedClosure = process.env['TAU_PICOGK_CLOSURE'] === 'pinned';

/** The pinned closure's store: kept apart from the local-layer store, so the two closures never share a run. */
export const pinnedStore = resolve(workspaceRoot, 'out/cache/picogk-pinned-store');

/** The checked-in manifest, as `tau prepare picogk` reads it. */
export const pinnedDeployment = parsePluginDeployment(
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8')),
  '@taucad/picogk tau-plugin.json',
);

/*
 * Captured at import, before any suite installs the global-fetch tripwire: the pinned closure's one deliberate
 * network path is this injected transport, and every other request in the suites must fail.
 */
const originFetch = globalThis.fetch;

const preparePinned = async (): Promise<ClosureReceipt> => {
  const host = createPreparationHost({
    plugins: [{ package: '@taucad/picogk', deployment: pinnedDeployment, launchSet: picogkLaunchSet }],
    store: pinnedStore,
    fetch: originFetch,
  });
  try {
    const outcome = await host.prepare({ package: '@taucad/picogk', signal: AbortSignal.timeout(10 * 60 * 1000) });
    const receipt = outcome.status === 'ready' ? outcome.receipts['runtime'] : undefined;
    if (receipt === undefined) {
      throw new Error(`Preparing the pinned PicoGK closure ended ${JSON.stringify(outcome)}.`);
    }
    return receipt;
  } finally {
    host.dispose();
  }
};

const prepareClosure = async (): Promise<PicogkClosureOptions> => {
  if (!existsSync(layerRecord)) {
    throw new Error(`${layerRecord} is missing; run \`pnpm nx run picogk:prepare-layer\` first.`);
  }
  const record = picogkLayerRecordSchema.parse(JSON.parse(readFileSync(layerRecord, 'utf8')));
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const deployment = parsePluginDeployment(
    composeManifest(manifest, record, stagedVariants),
    'picogk native test manifest',
  );
  const host = createPreparationHost({
    plugins: [{ package: '@taucad/picogk', deployment, launchSet: picogkLaunchSet }],
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

/** Whether the checked-in manifest pins a closure for this host's layer target. */
const manifestPinsHost = pinnedDeployment.dependencies['runtime']?.some(
  ({ target }) => target.runtime === 'native' && `${target.os}-${target.arch}` === hostTarget,
);

/**
 * Whether the native engine can run here (D13). Tau builds the engine for darwin-arm64 and linux-x64. On darwin-arm64
 * the suites always run, from the pinned closure or the local layer, whose absence fails them. On linux-x64 they run
 * from the pinned closure once the manifest pins one, and otherwise from a layer `picogk:prepare-layer-linux` built,
 * because the Linux engine builds in a container that the worker-only Linux jobs do not run. Every other host skips.
 */
export const nativeEngineAvailable =
  hostTarget === 'darwin-arm64' ||
  (hostTarget === 'linux-x64' && (pinnedClosure ? manifestPinsHost === true : existsSync(layerRecord)));

/**
 * The prepared closure the suites pass as the kernel's `closure` option; on a host that skips the native suites, a
 * schema-valid closure that names no file, so the suites still define their runtimes and launch nothing.
 */
/** The pinned closure's receipt, on a native host under `TAU_PICOGK_CLOSURE=pinned`; otherwise `undefined`. */
export const pinnedReceipt: ClosureReceipt | undefined =
  nativeEngineAvailable && pinnedClosure ? await preparePinned() : undefined;

export const nativeKernelOptions: PicogkClosureOptions = nativeEngineAvailable
  ? pinnedReceipt === undefined
    ? await prepareClosure()
    : picogkOptionsFromClosure(pinnedReceipt)
  : {
      workerExecutable: resolve(layerRoot, 'unavailable/dotnet/dotnet'),
      workerSha256: '0'.repeat(64),
      resourceFiles: [
        {
          path: resolve(layerRoot, 'unavailable/tau-worker/PicoGK.dll'),
          sha256: '0'.repeat(64),
          label: 'unavailable',
        },
      ],
      runtimePath: resolve(layerRoot, 'unavailable'),
      workerArguments: [],
    };
