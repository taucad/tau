import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import type { Build123dClosureOptions } from '@taucad/build123d';
import { defaultPayloadStore } from '@taucad/host';
import {
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
  readManagedPreparation,
} from '@taucad/runtime/preparation/node';
import type { PreparationHost, PreparationPlugin } from '@taucad/runtime/preparation/node';

/** Packages whose `tau-plugin.json` declares native runtime payloads; each is read without running plugin code. */
const nativePackages = ['@taucad/build123d', '@taucad/picogk'] as const;

const build123dPackage = '@taucad/build123d';

/**
 * Build123d compiles its closure's bytecode and proves it imports before the closure is sealed (D22). The module
 * loads only when a closure is actually sealed, so reading the roster stays cheap.
 * @param input - The closure being sealed.
 * @returns The seal step's refusal, if any.
 */
const sealBuild123d: NonNullable<PreparationPlugin['seal']> = async (input) => {
  const { sealBuild123dClosure } = await import('@taucad/build123d');
  return sealBuild123dClosure(input);
};

const seals: Readonly<Record<string, PreparationPlugin['seal']>> = { [build123dPackage]: sealBuild123d };

/**
 * The native plugins this CLI can prepare: each installed package that ships a `tau-plugin.json`, with its seal
 * step. A package that is not installed or ships none is skipped, so the roster grows as plugins adopt the manifest.
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
    const seal = seals[packageName];
    plugins.push({
      package: packageName,
      deployment: parsePluginDeployment(manifest, `${packageName} tau-plugin.json`),
      directory: dirname(manifestPath),
      ...(seal === undefined ? {} : { seal }),
    });
  }
  return plugins;
};

/** A preparation host over the shared payload store that only reads: `inspect` never downloads. */
const storeReader = (plugins: readonly PreparationPlugin[]): PreparationHost => {
  const managed = readManagedPreparation(process.env);
  const indicators = detectHostIndicators();
  return createPreparationHost({
    plugins,
    store: defaultPayloadStore(),
    ...(indicators === undefined ? {} : { indicators }),
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    selection: managed.selection,
  });
};

/**
 * Build123d's kernel options from the closure `tau prepare build123d` sealed, read from the store's receipts alone:
 * nothing is downloaded and no environment variable names a resource directory. A host that cannot read the store
 * (a permissioned child) composes no Build123d kernel.
 * @returns The options, or `undefined` when the closure is not prepared or the store cannot be read.
 */
export const preparedBuild123d = async (): Promise<Build123dClosureOptions | undefined> => {
  try {
    const plugins = await nativePreparationPlugins();
    const plugin = plugins.find((candidate) => candidate.package === build123dPackage);
    if (plugin === undefined) {
      return undefined;
    }
    const requires = Object.values(plugin.deployment.kernels).flatMap((row) => row.requires);
    const host = storeReader([plugin]);
    try {
      const { state } = await host.inspect({ package: build123dPackage, dependencies: requires });
      if (state.status !== 'ready') {
        return undefined;
      }
      const receipt = state.receipts[requires[0]!];
      if (receipt === undefined) {
        return undefined;
      }
      const { build123dOptionsFromClosure } = await import('@taucad/build123d');
      return build123dOptionsFromClosure(receipt);
    } finally {
      host.dispose();
    }
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
 * The typed refusal for an input a native kernel handles but this machine has not prepared: the kernel's row in its
 * package's `tau-plugin.json` names the extension, and the store holds no sealed closure for it.
 * @param extension - The input file's extension, without the dot.
 * @returns The refusal, or `undefined` when no installed native kernel handles the extension or it is prepared.
 */
export const unpreparedNativeKernel = async (extension: string): Promise<UnpreparedNativeKernel | undefined> => {
  const plugins = await nativePreparationPlugins();
  for (const plugin of plugins) {
    const kernel = Object.entries(plugin.deployment.kernels).find(([, row]) => row.extensions.includes(extension));
    if (kernel === undefined) {
      continue;
    }
    const [name, { requires }] = kernel;
    const host = storeReader([plugin]);
    try {
      // oxlint-disable-next-line no-await-in-loop -- at most one installed plugin owns an extension
      const { state } = await host.inspect({ package: plugin.package, dependencies: requires });
      if (state.status === 'ready') {
        return undefined;
      }
      if (state.status === 'blocked' && state.reason === 'unsupported-target') {
        return { code: 'UNSUPPORTED_TARGET', message: state.message };
      }
      return {
        code: 'KERNEL_NOT_PREPARED',
        message: `The ${name} kernel is not prepared on this machine. Run \`tau prepare ${name}\` once, then export again.`,
      };
    } finally {
      host.dispose();
    }
  }
  return undefined;
};
