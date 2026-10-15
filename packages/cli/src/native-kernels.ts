import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { build123dOptionsFromClosure, sealBuild123dClosure } from '@taucad/build123d';
import type { Build123dClosureOptions } from '@taucad/build123d';
import { defaultPayloadStore } from '@taucad/host';
import { picogkOptionsFromClosure } from '@taucad/picogk';
import type { PicogkKernelOptions } from '@taucad/picogk';
import { createPreparationHost, parsePluginDeployment, readManagedPreparation } from '@taucad/runtime/preparation/node';
import type {
  ClosureReceipt,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

import { cliError, exitCodes } from '#output.js';

// Packages whose `tau-plugin.json` declares native runtime payloads; each is read without running plugin code.
const nativePackages = ['@taucad/build123d', '@taucad/picogk'] as const;

/** The kernel options each native package's sealed closure maps to, keyed as `createCliRuntime` takes them. */
export type PreparedNativeKernel =
  | { readonly build123d: Build123dClosureOptions }
  | { readonly picogk: PicogkKernelOptions };

// Per package: the options its sealed closure gives, and the seal step, if any, that runs before the closure is sealed.
const adopters: Readonly<
  Record<
    string,
    { readonly options: (receipt: ClosureReceipt) => PreparedNativeKernel; readonly seal?: PreparationPlugin['seal'] }
  >
> = {
  // Build123d compiles its bytecode and proves the closure imports before the seal (D22).
  '@taucad/build123d': {
    options: (receipt) => ({ build123d: build123dOptionsFromClosure(receipt) }),
    seal: sealBuild123dClosure,
  },
  '@taucad/picogk': { options: (receipt) => ({ picogk: picogkOptionsFromClosure(receipt) }) },
};

/**
 * The managed acquisition profile from the environment.
 * @returns The profile.
 * @throws {Error} `MANAGED_PROFILE_INVALID` (exit 2) when a variable is malformed.
 */
export const readManaged = (): ManagedPreparation => {
  try {
    return readManagedPreparation(process.env);
  } catch (error) {
    throw cliError('MANAGED_PROFILE_INVALID', error instanceof Error ? error.message : String(error), exitCodes.usage);
  }
};

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
    const seal = adopters[packageName]?.seal;
    plugins.push({
      package: packageName,
      deployment: parsePluginDeployment(manifest, `${packageName} tau-plugin.json`),
      directory: dirname(manifestPath),
      ...(seal && { seal }),
    });
  }
  return plugins;
};

// A preparation host over the shared payload store; `inspect` reads receipts and never downloads, so an inspect-only
// host starts no attempt and holds nothing to dispose.
const storeReader = (plugin: PreparationPlugin): PreparationHost => {
  const managed = readManaged();
  return createPreparationHost({
    plugins: [plugin],
    store: defaultPayloadStore(),
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    selection: managed.selection,
  });
};

/** Why the native kernel for an input could not be composed. */
export type UnpreparedNativeKernel = {
  readonly code: 'KERNEL_NOT_PREPARED' | 'UNSUPPORTED_TARGET';
  readonly message: string;
};

/**
 * The native kernel whose `tau-plugin.json` row handles an input, read from the store's receipts alone: nothing is
 * downloaded, and an input no native kernel handles leaves the store untouched.
 * @param extension - The input file's extension, without the dot.
 * @returns The prepared kernel's options, the typed refusal when it is not prepared, or `undefined` when no native
 *   kernel handles the extension.
 */
export const nativeKernelFor = async (
  extension: string,
): Promise<PreparedNativeKernel | UnpreparedNativeKernel | undefined> => {
  for (const plugin of await nativePreparationPlugins()) {
    for (const [name, { requires, extensions }] of Object.entries(plugin.deployment.kernels)) {
      if (extensions.includes(extension)) {
        // oxlint-disable-next-line no-await-in-loop -- at most one installed kernel owns an extension
        const { state } = await storeReader(plugin).inspect({ package: plugin.package, dependencies: requires });
        const receipt = state.status === 'ready' ? state.receipts[requires[0]] : undefined;
        if (receipt !== undefined) {
          return adopters[plugin.package]?.options(receipt);
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
