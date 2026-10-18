/**
 * The host-neutral payload-store side of the native kernel roster, for Node hosts: the preparation roster, composing
 * every native kernel from the store's launch indexes, loading the composed kernels' plugins, the closure re-verifier
 * and the preparation host a long-lived process prepares through. The caller injects the store and the managed
 * profile, so this module never imports a host product package.
 *
 * @module
 */
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

import type { NativeKernelBounds } from '@taucad/native-process-core/adopter';
import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
import type { NativeRuntimeVerifier } from '@taucad/native-process-core';
import type { PluginInstance } from '@taucad/runtime/plugin';
import {
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
  PreparationError,
  reverifyClosure,
  selectVariant,
} from '@taucad/runtime/preparation/node';
import type {
  HostIndicators,
  Integrity,
  KernelDeployment,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

import { adopterFor, composedRow, nativeKernelAdopters } from '#adopters.js';
import type {
  AdopterOf,
  ComposedNativeKernel,
  ComposedNativeKernelOf,
  NativeKernelComposition,
  NativePackage,
} from '#adopters.js';
import { nativeKernelManifests } from '#manifest.js';
import type { UnavailableNativeKernel } from '#unavailable-kernels.js';

/**
 * The preparation roster: each native package's parsed `tau-plugin.json` with its seal step and launch set, in roster
 * order. No plugin code runs.
 * @param input - `directory: 'resolve'` adds each package's root, which preparing a payload shipped inside the package
 *   needs; the default, `'none'`, suits a bundled host that only seeds and inspects closures.
 * @returns One preparation plugin per roster package.
 * @public
 */
export const nativePreparationPlugins = (
  input: { readonly directory?: 'resolve' | 'none' } = {},
): readonly PreparationPlugin[] => {
  const require = input.directory === 'resolve' ? createRequire(import.meta.url) : undefined;
  return nativeKernelAdopters.map((adopter) => ({
    package: adopter.package,
    deployment: parsePluginDeployment(nativeKernelManifests[adopter.package], `${adopter.package} tau-plugin.json`),
    ...(require && { directory: dirname(require.resolve(`${adopter.package}/package.json`)) }),
    ...(adopter.seal && { seal: adopter.seal }),
    launchSet: adopter.launchSet,
  }));
};

/**
 * A closure re-verifier for native workers launched from the payload store: a worker that exits before its handshake
 * re-verifies its closure against the receipt beside it, so the refusal names the damaged file. A root without a
 * receipt was a sealed closure when it was composed, so a repair that stopped half way is named as `receipt.json`.
 * @param remedy - The host's repair instruction: `files` is `undefined` when the receipt itself is missing.
 * @returns The verifier `installNativeRuntimeVerifier` takes.
 * @public
 */
export const verifyStoreClosure =
  (remedy: (files: readonly string[] | undefined, root: string) => string): NativeRuntimeVerifier =>
  async (root, signal) => {
    const files = await reverifyClosure(root, signal);
    if (files?.length === 0) {
      return undefined;
    }
    return { files: files ?? ['receipt.json'], remedy: remedy(files, root) };
  };

const defaultRemedy = (files: readonly string[] | undefined): string =>
  files === undefined ? 'Run `tau prepare` for the kernel to rebuild it.' : 'Run `tau prepare --verify` to repair it.';

/**
 * The digest-keyed payload store every Tau host on this computer shares, for a host that does not depend on
 * `@taucad/host` (which resolves the same root): the per-OS data root (Application Support on macOS,
 * `$XDG_DATA_HOME/tau` on Linux, `%LOCALAPPDATA%\tau` on Windows), or `<TAU_CONFIG_DIR>/payloads` when the one
 * override is set.
 * @returns Absolute store root.
 * @public
 */
export const defaultPayloadStore = (): string => {
  if (process.env['TAU_CONFIG_DIR']) {
    return join(process.env['TAU_CONFIG_DIR'], 'payloads');
  }
  if (platform() === 'win32') {
    return join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'tau', 'payloads');
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tau', 'payloads');
  }
  // An empty XDG_DATA_HOME means the default, as the XDG Base Directory specification says.
  const dataHome = process.env['XDG_DATA_HOME'];
  return join(
    dataHome === undefined || dataHome === '' ? join(homedir(), '.local', 'share') : dataHome,
    'tau',
    'payloads',
  );
};

/**
 * Where a host's payload store is and which managed profile applies to it.
 * @public
 */
export type NativeStoreInput = {
  /** Absolute payload store root. */
  readonly store: string;
  /** The managed acquisition profile, from `readManagedPreparation`. */
  readonly managed: ManagedPreparation;
};

// A preparation host over the payload store; `inspectLaunch` reads launch indexes and never downloads, so an
// inspect-only host starts no attempt and holds nothing to dispose.
const storeReader = (plugin: PreparationPlugin, input: NativeStoreInput): PreparationHost =>
  createPreparationHost({
    plugins: [plugin],
    store: input.store,
    ...(input.managed.seed === undefined ? {} : { seed: input.managed.seed }),
    selection: input.managed.selection,
  });

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

/** One declared kernel of a roster package, as its store reads it. */
type KernelState =
  | { readonly status: 'composed'; readonly row: ComposedNativeKernel }
  | { readonly status: 'unavailable'; readonly row: UnavailableNativeKernel };

const inspectKernel = async (
  input: NativeStoreInput & {
    readonly plugin: PreparationPlugin;
    readonly kernel: string;
    readonly deployment: KernelDeployment;
  },
): Promise<KernelState> => {
  const { requires, extensions } = input.deployment;
  const state = await storeReader(input.plugin, input).inspectLaunch({
    package: input.plugin.package,
    dependencies: requires,
  });
  const closure = state.status === 'ready' ? state.closures[requires[0]] : undefined;
  const adopter = adopterFor(input.plugin.package);
  if (closure !== undefined && adopter !== undefined) {
    return { status: 'composed', row: composedRow(adopter, input.kernel, closure) };
  }
  const unsupported = state.status === 'blocked' && state.reason === 'unsupported-target';
  return {
    status: 'unavailable',
    row: {
      kernel: input.kernel,
      package: input.plugin.package,
      extensions,
      reason: unsupported ? 'unsupported-target' : 'not-prepared',
      byteLength: unsupported ? 0 : preparationBytes(input.plugin, requires, input.managed),
      ...(unsupported ? { detail: state.message } : {}),
    },
  };
};

/*
 * Closures are composed by the store's real path. The native sandbox denies reads under shared roots such as `/tmp`
 * and grants a closure by its real path, so a worker started through a link (macOS's `/tmp` is one to `/private/tmp`,
 * as a linked home or config directory may be) exits before it runs.
 */
const realStore = async (store: string): Promise<string> => {
  try {
    return await realpath(store);
  } catch {
    return store;
  }
};

/**
 * Compose every native kernel in the roster from the payload store: a sealed closure gives its kernel's options, and
 * any other state gives the refusal a host answers that kernel's files with. Launch indexes only: nothing is
 * downloaded, no closure is verified and no full receipt is parsed, so this is a per-launch cost. When any kernel is
 * composed, the store's closure re-verifier is installed, so a worker that exits before its handshake names what
 * differs.
 * @param input - The payload store and the managed profile.
 * @returns The composition, in roster order.
 * @public
 */
export const composeNativeKernels = async (input: NativeStoreInput): Promise<NativeKernelComposition> => {
  const store = { ...input, store: await realStore(input.store) };
  const kernels: ComposedNativeKernel[] = [];
  const unavailable: UnavailableNativeKernel[] = [];
  for (const plugin of nativePreparationPlugins()) {
    for (const [kernel, deployment] of Object.entries(plugin.deployment.kernels)) {
      // oxlint-disable-next-line no-await-in-loop -- a few small launch indexes, read in roster order
      const state = await inspectKernel({ ...store, plugin, kernel, deployment });
      if (state.status === 'composed') {
        kernels.push(state.row);
      } else {
        unavailable.push(state.row);
      }
    }
  }
  if (kernels.length > 0) {
    installNativeRuntimeVerifier(verifyStoreClosure(defaultRemedy));
  }
  return { kernels, unavailable, closureRoots: kernels.map(({ closureRoot }) => closureRoot) };
};

/**
 * The native kernel whose `tau-plugin.json` row handles an input, read from the store's launch index alone: nothing is
 * downloaded, and an input no native kernel handles leaves the store untouched.
 * @param input - The input file's extension without the dot, the payload store and the managed profile.
 * @returns The composed kernel, why it is unavailable, or `undefined` when no native kernel handles the extension.
 * @public
 */
export const nativeKernelFor = async (
  input: NativeStoreInput & { readonly extension: string },
): Promise<ComposedNativeKernel | UnavailableNativeKernel | undefined> => {
  const store = await realStore(input.store);
  for (const plugin of nativePreparationPlugins()) {
    for (const [kernel, deployment] of Object.entries(plugin.deployment.kernels)) {
      if (deployment.extensions.includes(input.extension)) {
        // oxlint-disable-next-line no-await-in-loop -- at most one roster kernel owns an extension
        const state = await inspectKernel({ ...input, store, plugin, kernel, deployment });
        if (state.status === 'composed') {
          installNativeRuntimeVerifier(verifyStoreClosure(defaultRemedy));
        }
        return state.row;
      }
    }
  }
  return undefined;
};

const pluginFor = async <P extends NativePackage>(
  adopter: AdopterOf<P>,
  row: ComposedNativeKernelOf<P>,
  bounds: NativeKernelBounds,
): Promise<PluginInstance> => {
  const factory = await adopter.load();
  return factory({ ...row.options, ...bounds });
};

/**
 * Load each composed kernel's plugin through its adopter, with the host's bounds over the closure's options.
 * @param rows - The composed kernels, as {@link composeNativeKernels} gives them or `nativeCompositionSchema` parsed
 *   them.
 * @param bounds - The host's request timeout and artifact size policy.
 * @returns One plugin per row, in order.
 * @throws {Error} When a row names a package the roster does not hold.
 * @public
 */
export const composeNativePlugins = async (
  rows: readonly ComposedNativeKernel[],
  bounds: NativeKernelBounds = {},
): Promise<readonly PluginInstance[]> =>
  Promise.all(
    rows.map(async (row) => {
      const adopter = adopterFor(row.package);
      if (adopter === undefined) {
        throw new Error(`No native kernel package in the roster is called '${row.package}'.`);
      }
      return pluginFor(adopter, row, bounds);
    }),
  );

/**
 * The native kernels this host can run: each roster kernel whose every required dependency has a variant for the
 * host's indicators.
 * @param indicators - The host, from `detectHostIndicators`.
 * @returns Kernel names, in roster order.
 * @public
 */
export const nativeKernelIdsSupportedOn = (indicators: HostIndicators): readonly string[] =>
  nativePreparationPlugins().flatMap(({ deployment }) =>
    Object.entries(deployment.kernels)
      .filter(([, { requires }]) =>
        requires.every(
          (dependency) => selectVariant(deployment.dependencies[dependency] ?? [], indicators).status === 'selected',
        ),
      )
      .map(([kernel]) => kernel),
  );

/**
 * What `prepare_kernel` answers.
 * @public
 */
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

/**
 * One progress report of a preparation: bytes done of the total, strictly increasing.
 * @public
 */
export type PrepareKernelProgress = { readonly progress: number; readonly total: number; readonly message: string };

/**
 * A preparation host for one long-lived process, joining concurrent calls for one kernel.
 * @public
 */
export type NativePreparation = {
  /**
   * Prepare a kernel by name.
   * @throws {UnknownNativeKernelError} When no roster package declares it.
   */
  readonly prepare: (
    kernel: string,
    context: { readonly signal: AbortSignal; readonly onProgress?: (progress: PrepareKernelProgress) => void },
  ) => Promise<PrepareKernelOutput>;
  readonly dispose: () => Promise<void>;
};

/**
 * No roster package declares the kernel a caller asked to prepare; `known` names those that can be prepared.
 * @public
 */
export class UnknownNativeKernelError extends Error {
  public override readonly name = 'UnknownNativeKernelError';
  public readonly code: 'UNKNOWN_KERNEL';
  public readonly kernel: string;
  public readonly known: readonly string[];

  public constructor(kernel: string, known: readonly string[]) {
    super(
      `No native kernel is called '${kernel}'. Kernels that can be prepared: ${known.length === 0 ? 'none are installed' : known.join(', ')}.`,
    );
    this.code = 'UNKNOWN_KERNEL';
    this.kernel = kernel;
    this.known = known;
  }
}

/**
 * Open the preparation host a long-lived process prepares native kernels through: the roster with its seal steps,
 * the payload store and the managed profile, with the process's unrestricted `fetch` unless one is given. Verified
 * payloads persist, so a cancelled or failed call leaves the next one only the remainder to download.
 * @param input - The payload store, the managed profile and, for tests, the transport.
 * @returns The preparation and its disposal.
 * @public
 */
export const openNativePreparation = (
  input: NativeStoreInput & { readonly fetch?: typeof fetch },
): NativePreparation => {
  let opened: Promise<{ host: PreparationHost; plugins: readonly PreparationPlugin[] }> | undefined;
  const open = async () => {
    const { managed } = input;
    const plugins = nativePreparationPlugins({ directory: 'resolve' });
    const indicators = detectHostIndicators();
    const host = createPreparationHost({
      plugins,
      store: input.store,
      ...(indicators === undefined ? {} : { indicators }),
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
      ...(managed.seed === undefined ? {} : { seed: managed.seed }),
      selection: managed.selection,
    });
    return { host, plugins };
  };
  return {
    prepare: async (kernel, { signal, onProgress }) => {
      opened ??= open();
      const { host, plugins } = await opened;
      const owner = plugins.find((plugin) => Object.hasOwn(plugin.deployment.kernels, kernel));
      const requires = owner?.deployment.kernels[kernel]?.requires;
      if (owner === undefined || requires === undefined) {
        throw new UnknownNativeKernelError(
          kernel,
          plugins.flatMap((plugin) => Object.keys(plugin.deployment.kernels)).toSorted(),
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
        const outcome = await host.prepare({
          package: owner.package,
          dependencies: requires,
          offline: input.managed.offline,
          signal,
        });
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
