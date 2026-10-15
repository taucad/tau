import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { build123dOptionsFromClosure, sealBuild123dClosure } from '@taucad/build123d';
import type { Build123dClosureOptions } from '@taucad/build123d';
import { defaultPayloadStore } from '@taucad/host';
import { createPreparationHost, parsePluginDeployment, readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { PreparationHost, PreparationPlugin } from '@taucad/runtime/preparation/node';

// Packages whose `tau-plugin.json` declares native runtime payloads; each is read without running plugin code.
const nativePackages = ['@taucad/build123d', '@taucad/picogk'] as const;

const build123dPackage = '@taucad/build123d';

/**
 * The native plugins this CLI can prepare, with their seal steps; an absent package is skipped.
 * @returns The roster.
 */
export const nativePreparationPlugins = async (): Promise<readonly PreparationPlugin[]> => {
  const require = createRequire(import.meta.url);
  const plugins: PreparationPlugin[] = [];
  for (const packageName of nativePackages) {
    let manifestPath: string;
    try {
      manifestPath = require.resolve(`${packageName}/tau-plugin.json`);
    } catch {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- two small manifests, read in roster order
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    plugins.push({
      package: packageName,
      deployment: parsePluginDeployment(manifest, `${packageName} tau-plugin.json`),
      directory: dirname(manifestPath),
      // Build123d compiles its bytecode and proves the closure imports before the seal (D22).
      ...(packageName === build123dPackage && { seal: sealBuild123dClosure }),
    });
  }
  return plugins;
};

// A preparation host over the shared payload store; `inspect` reads receipts and never downloads.
const storeReader = (plugins: readonly PreparationPlugin[]): PreparationHost => {
  const managed = readManagedPreparation(process.env);
  return createPreparationHost({
    plugins,
    store: defaultPayloadStore(),
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    selection: managed.selection,
  });
};

/**
 * Build123d's options from its sealed closure, read from the store's receipts alone.
 * @returns The options, or `undefined` when it is not prepared or the store cannot be read (a permissioned child).
 */
export const preparedBuild123d = async (): Promise<Build123dClosureOptions | undefined> => {
  try {
    const plugins = await nativePreparationPlugins();
    const plugin = plugins.find((candidate) => candidate.package === build123dPackage);
    if (plugin === undefined) {
      return undefined;
    }
    const requires = Object.values(plugin.deployment.kernels).flatMap((row) => row.requires);
    // An inspect-only host starts no attempt, so it holds nothing to dispose.
    const { state } = await storeReader([plugin]).inspect({ package: build123dPackage, dependencies: requires });
    const receipt = state.status === 'ready' ? state.receipts[requires[0]!] : undefined;
    return receipt && build123dOptionsFromClosure(receipt);
  } catch {
    return undefined;
  }
};

/** Why the native kernel for an input could not be composed. */
export type UnpreparedNativeKernel = {
  readonly code: 'KERNEL_NOT_PREPARED' | 'UNSUPPORTED_TARGET';
  readonly message: string;
};

/**
 * The typed refusal for an input whose native kernel (by its `tau-plugin.json` row) is not prepared on this machine.
 * @param extension - The input file's extension, without the dot.
 * @returns The refusal, or `undefined` when no native kernel handles the extension or it is prepared.
 */
export const unpreparedNativeKernel = async (extension: string): Promise<UnpreparedNativeKernel | undefined> => {
  for (const plugin of await nativePreparationPlugins()) {
    for (const [name, { requires, extensions }] of Object.entries(plugin.deployment.kernels)) {
      if (extensions.includes(extension)) {
        // oxlint-disable-next-line no-await-in-loop -- at most one installed kernel owns an extension
        const { state } = await storeReader([plugin]).inspect({ package: plugin.package, dependencies: requires });
        if (state.status === 'ready') {
          return undefined;
        }
        return state.status === 'blocked' && state.reason === 'unsupported-target'
          ? { code: 'UNSUPPORTED_TARGET', message: state.message }
          : {
              code: 'KERNEL_NOT_PREPARED',
              message: `The ${name} kernel is not prepared on this machine. Run \`tau prepare ${name}\` once, then export again.`,
            };
      }
    }
  }
  return undefined;
};
