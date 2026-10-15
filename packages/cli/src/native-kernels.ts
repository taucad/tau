import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { build123dLaunchSet, build123dOptionsFromClosure, sealBuild123dClosure } from '@taucad/build123d';
import type { Build123dClosureOptions } from '@taucad/build123d';
import { defaultPayloadStore } from '@taucad/host';
import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
import type { NativeRuntimeVerifier } from '@taucad/native-process-core';
import { picogkLaunchSet, picogkOptionsFromClosure } from '@taucad/picogk';
import type { PicogkKernelOptions } from '@taucad/picogk';
import {
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
  PreparationError,
  readManagedPreparation,
  reverifyClosure,
  selectVariant,
} from '@taucad/runtime/preparation/node';
import type {
  ClosureLaunch,
  Integrity,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

import { cliError, exitCodes } from '#output.js';
import type { UnavailableNativeKernel } from '#unprepared-kernels.js';

// Packages whose `tau-plugin.json` declares native runtime payloads; each is read without running plugin code.
const nativePackages = ['@taucad/build123d', '@taucad/picogk'] as const;

/** The kernel options each native package's sealed closure maps to, keyed as `createCliRuntime` takes them. */
export type PreparedNativeKernel =
  | { readonly build123d: Build123dClosureOptions }
  | { readonly picogk: PicogkKernelOptions };

// Per package: the options its sealed closure gives, the seal step, if any, that runs before the closure is sealed,
// and the launch set its launch index records (D8, X29).
const adopters: Readonly<
  Record<
    string,
    {
      readonly options: (closure: ClosureLaunch) => PreparedNativeKernel;
      readonly seal?: PreparationPlugin['seal'];
      readonly launchSet: NonNullable<PreparationPlugin['launchSet']>;
    }
  >
> = {
  // Build123d compiles its bytecode and proves the closure imports before the seal (D22).
  '@taucad/build123d': {
    options: (closure) => ({ build123d: build123dOptionsFromClosure(closure) }),
    seal: sealBuild123dClosure,
    launchSet: build123dLaunchSet,
  },
  '@taucad/picogk': {
    options: (closure) => ({ picogk: picogkOptionsFromClosure(closure) }),
    launchSet: picogkLaunchSet,
  },
};

/**
 * D8: a native worker that exits before its handshake re-verifies its closure against the receipt beside it, so the
 * refusal names the damaged file. A runtime root without a receipt was a sealed closure when it was composed, so a
 * repair that stopped half way is named too.
 * @param root - The worker's closure root.
 * @param signal - Aborts the re-verification.
 * @returns The damaged files and the repair, or `undefined` when the closure is intact.
 */
export const verifyStoreClosure: NativeRuntimeVerifier = async (root, signal) => {
  const files = await reverifyClosure(root, signal);
  if (files?.length === 0) {
    return undefined;
  }
  return {
    files: files ?? ['receipt.json'],
    remedy:
      files === undefined
        ? 'Run `tau prepare` for the kernel to rebuild it.'
        : 'Run `tau prepare --verify` to repair it.',
  };
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
    const adopter = adopters[packageName];
    plugins.push({
      package: packageName,
      deployment: parsePluginDeployment(manifest, `${packageName} tau-plugin.json`),
      directory: dirname(manifestPath),
      ...(adopter?.seal && { seal: adopter.seal }),
      ...(adopter && { launchSet: adopter.launchSet }),
    });
  }
  return plugins;
};

// A preparation host over the shared payload store; `inspectLaunch` reads launch indexes and never downloads, so an
// inspect-only host starts no attempt and holds nothing to dispose.
const storeReader = (plugin: PreparationPlugin, store = defaultPayloadStore()): PreparationHost => {
  const managed = readManaged();
  return createPreparationHost({
    plugins: [plugin],
    store,
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
        const state = await storeReader(plugin).inspectLaunch({ package: plugin.package, dependencies: requires });
        const closure = state.status === 'ready' ? state.closures[requires[0]] : undefined;
        if (closure !== undefined) {
          installNativeRuntimeVerifier(verifyStoreClosure);
          return adopters[plugin.package]?.options(closure);
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

/** The native kernels a CLI runtime composes, read from the store's receipts alone. */
export type NativeComposition = {
  /** Options for each native kernel whose closure is sealed, as `createCliRuntime` takes them. */
  readonly build123d?: Build123dClosureOptions;
  readonly picogk?: PicogkKernelOptions;
  /** Every declared native kernel that is not composed, with why; the runtime answers its files with the refusal. */
  readonly unavailable: readonly UnavailableNativeKernel[];
  /** The sealed closure each composed kernel runs from; a daemon starts native workers from these alone (D37). */
  readonly closureRoots?: readonly string[];
};

// The bytes preparing a kernel downloads on this host: the payloads of the variant each required dependency selects.
const preparationBytes = (plugin: PreparationPlugin, requires: readonly string[], managed: ManagedPreparation) => {
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    return 0;
  }
  let byteLength = 0;
  for (const dependency of requires) {
    const selection = selectVariant(plugin.deployment.dependencies[dependency] ?? [], indicators, managed.selection);
    for (const payload of selection.status === 'selected' ? selection.variant.payloads : []) {
      byteLength += payload.byteLength;
    }
  }
  return byteLength;
};

/**
 * Compose every native kernel the CLI declares from the payload store: a sealed closure gives its kernel options, and
 * any other state gives the refusal the runtime answers that kernel's files with. Launch indexes only: nothing is
 * downloaded, no closure is verified and no full receipt is parsed, so this is a per-launch cost (I11). A worker that
 * then exits before its handshake re-verifies its closure and names what differs (D8).
 * @returns The composition.
 */
export const composeNativeKernels = async (): Promise<NativeComposition> => {
  const managed = readManaged();
  /* Closures are composed by the store's real path. The native sandbox denies reads under shared roots such as `/tmp`
   * and grants a closure by its real path, so a worker started through a link (macOS's `/tmp` is one to
   * `/private/tmp`, as a linked home or `TAU_CONFIG_DIR` may be) exits before it runs. */
  const store = await realpath(defaultPayloadStore()).catch(() => defaultPayloadStore());
  const kernels: { build123d?: Build123dClosureOptions; picogk?: PicogkKernelOptions } = {};
  const unavailable: UnavailableNativeKernel[] = [];
  const closureRoots: string[] = [];
  for (const plugin of await nativePreparationPlugins()) {
    for (const [kernel, { requires, extensions }] of Object.entries(plugin.deployment.kernels)) {
      // oxlint-disable-next-line no-await-in-loop -- two small manifests, read in roster order
      const state = await storeReader(plugin, store).inspectLaunch({ package: plugin.package, dependencies: requires });
      const closure = state.status === 'ready' ? state.closures[requires[0]] : undefined;
      const options = closure === undefined ? undefined : adopters[plugin.package]?.options(closure);
      if (closure !== undefined && options !== undefined) {
        installNativeRuntimeVerifier(verifyStoreClosure);
        Object.assign(kernels, options);
        closureRoots.push(closure.root);
        continue;
      }
      const unsupported = state.status === 'blocked' && state.reason === 'unsupported-target';
      unavailable.push({
        kernel,
        package: plugin.package,
        extensions,
        reason: unsupported ? 'unsupported-target' : 'not-prepared',
        byteLength: unsupported ? 0 : preparationBytes(plugin, requires, managed),
        ...(unsupported ? { detail: state.message } : {}),
      });
    }
  }
  return { ...kernels, unavailable, closureRoots };
};

/** What `prepare_kernel` answers (D7). */
export type PrepareKernelOutput =
  | {
      readonly status: 'ready';
      readonly kernel: string;
      readonly closureIntegrity: Integrity;
      readonly treeIntegrity: Integrity;
      readonly byteLength: number;
    }
  | {
      readonly status: 'blocked';
      readonly kernel: string;
      readonly reason: 'unsupported-target' | 'offline-miss' | 'missing-system-library';
      readonly message: string;
    }
  | { readonly status: 'cancelled'; readonly kernel: string; readonly message: string }
  | { readonly status: 'failed'; readonly kernel: string; readonly code: string; readonly message: string };

/** One progress report of a preparation: bytes done of the total, strictly increasing. */
export type PrepareKernelProgress = { readonly progress: number; readonly total: number; readonly message: string };

/** A preparation host for one long-lived process (`tau mcp`), joining concurrent calls for one kernel. */
export type NativePreparation = {
  /**
   * Prepare a kernel by name.
   * @throws {Error} `UNKNOWN_KERNEL` when no installed package declares it, naming the kernels that can be prepared.
   */
  readonly prepare: (
    kernel: string,
    context: { readonly signal: AbortSignal; readonly onProgress?: (progress: PrepareKernelProgress) => void },
  ) => Promise<PrepareKernelOutput>;
  readonly dispose: () => Promise<void>;
};

/**
 * Open the preparation host `tau mcp` prepares through: the CLI's roster with its seal steps, the shared store and
 * the managed profile, with the process's unrestricted `fetch` (D4). Verified payloads persist, so a cancelled or
 * failed call leaves the next one only the remainder to download.
 * @param options - The transport, for tests.
 * @returns The preparation and its disposal.
 */
export const openNativePreparation = (options: { readonly fetch?: typeof fetch } = {}): NativePreparation => {
  let opened: Promise<{ host: PreparationHost; plugins: readonly PreparationPlugin[]; offline: boolean }> | undefined;
  const open = async () => {
    const managed = readManaged();
    const plugins = await nativePreparationPlugins();
    const indicators = detectHostIndicators();
    const host = createPreparationHost({
      plugins,
      store: defaultPayloadStore(),
      ...(indicators === undefined ? {} : { indicators }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
      ...(managed.seed === undefined ? {} : { seed: managed.seed }),
      selection: managed.selection,
    });
    return { host, plugins, offline: managed.offline };
  };
  return {
    prepare: async (kernel, { signal, onProgress }) => {
      opened ??= open();
      const { host, plugins, offline } = await opened;
      const owner = plugins.find((plugin) => Object.hasOwn(plugin.deployment.kernels, kernel));
      const requires = owner?.deployment.kernels[kernel]?.requires;
      if (owner === undefined || requires === undefined) {
        const known = plugins.flatMap((plugin) => Object.keys(plugin.deployment.kernels)).toSorted();
        throw cliError(
          'UNKNOWN_KERNEL',
          `No native kernel is called '${kernel}'. Kernels that can be prepared: ${known.length === 0 ? 'none are installed' : known.join(', ')}.`,
          exitCodes.usage,
        );
      }
      let reported = 0;
      const unsubscribe = host.on('preparation', ({ selection, state }) => {
        /* MCP progress must increase with every notification: a phase that moves no bytes is not reported. */
        if (selection.package === owner.package && state.status === 'preparing' && state.completedBytes > reported) {
          reported = state.completedBytes;
          onProgress?.({
            progress: state.completedBytes,
            total: state.totalBytes,
            message: `${state.phase} ${state.payload} (${String(state.completedPayloads)}/${String(state.totalPayloads)})`,
          });
        }
      });
      try {
        const outcome = await host.prepare({ package: owner.package, dependencies: requires, offline, signal });
        if (outcome.status === 'cancelled') {
          return {
            status: 'cancelled',
            kernel,
            message: `Preparing ${kernel} was cancelled; verified payloads are kept, so the next call downloads only the rest.`,
          };
        }
        if (outcome.status === 'blocked') {
          return { status: 'blocked', kernel, reason: outcome.reason, message: outcome.message };
        }
        const receipts = requires.flatMap((dependency) => outcome.receipts[dependency] ?? []);
        const [first] = receipts;
        if (first === undefined) {
          throw new Error(
            `${kernel} is ready but holds no receipt; the store is inconsistent. Run tau prepare --verify.`,
          );
        }
        return {
          status: 'ready',
          kernel,
          closureIntegrity: first.closureIntegrity,
          treeIntegrity: first.treeIntegrity,
          byteLength: receipts.flatMap((receipt) => receipt.files).reduce((sum, file) => sum + file.byteLength, 0),
        };
      } catch (error) {
        if (error instanceof PreparationError) {
          return { status: 'failed', kernel, code: error.code, message: error.message };
        }
        throw error;
      } finally {
        unsubscribe();
      }
    },
    dispose: async () => {
      const session = await opened;
      session?.host.dispose();
    },
  };
};

/**
 * The kernels a tool result refuses as not prepared: every `KERNEL_NOT_PREPARED` issue's `details.kernel`, wherever
 * the tool placed its issues.
 * @param value - A tool result's content.
 * @param found - Accumulator.
 * @returns The kernel names.
 */
export const refusedKernels = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) {
      refusedKernels(item, found);
    }
    return found;
  }
  if (typeof value !== 'object' || value === null) {
    return found;
  }
  const details: unknown = Reflect.get(value, 'details');
  const kernel: unknown = typeof details === 'object' && details !== null ? Reflect.get(details, 'kernel') : undefined;
  if (Reflect.get(value, 'code') === 'KERNEL_NOT_PREPARED' && typeof kernel === 'string') {
    found.add(kernel);
  }
  for (const child of Object.values(value)) {
    refusedKernels(child, found);
  }
  return found;
};
