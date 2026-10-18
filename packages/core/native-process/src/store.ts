/**
 * The payload-store side of native kernels, for Node hosts: discovering the native deployments a resolved runtime
 * lists, the preparation plugins they give, reading the store's launch indexes for a kernel's sealed closure, the
 * closure resolver a kernel binds through in `initialize`, the closure re-verifier, the preparation host a long-lived
 * process prepares through, and the package-neutral report a runtime thread or child sends its parent.
 *
 * Nothing here names a kernel: every input is a deployment a kernel registration carried
 * (`withNativeDeployment`, `./adopter`).
 *
 * @module
 */
import { realpath } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KernelIssue } from '@taucad/runtime/kernel';
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
  HostIndicators,
  Integrity,
  ManagedPreparation,
  PluginDeployment,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';
import { z } from 'zod';

import { nativeDeploymentOf } from '#native-kernel-adopter.js';
import type { NativeKernelBounds, NativeKernelDeployment } from '#native-kernel-adopter.js';
import { installNativeRuntimeVerifier } from '#native-process-session.js';
import type { NativeRuntimeVerifier } from '#native-process-session.js';

/**
 * The digest-keyed payload store every Tau host on this computer shares: the per-OS data root (Application Support
 * on macOS, `$XDG_DATA_HOME/tau` on Linux, `%LOCALAPPDATA%\tau` on Windows), or `<TAU_CONFIG_DIR>/payloads` when the
 * one override is set.
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

/**
 * One kernel a native deployment declares, as a resolved runtime routes it.
 * @public
 */
export type NativeKernelRow = {
  /** Kernel id, as the registration and `tau-plugin.json` name it and `tau prepare` takes it. */
  readonly id: string;
  /** Extensions the registration claims, without the dot. */
  readonly extensions: readonly string[];
  /** The dependencies of `tau-plugin.json` the kernel's closure is sealed from. */
  readonly requires: readonly string[];
};

/**
 * One native kernel package a resolved runtime lists, with the kernels of it the runtime routes.
 * @public
 */
export type NativeKernelDeploymentRow = {
  readonly deployment: NativeKernelDeployment;
  readonly kernels: readonly NativeKernelRow[];
};

/**
 * The part of a resolved runtime definition (`resolveRuntimeDefinition(...)`) native discovery reads.
 * @public
 */
export type ResolvedRuntimeKernels = {
  readonly kernels: ReadonlyArray<{ readonly id: string; readonly extensions: readonly string[] }>;
};

const parsedManifests = new WeakMap<NativeKernelDeployment, PluginDeployment>();

/**
 * A deployment's parsed `tau-plugin.json`, parsed once per deployment.
 * @param deployment - The deployment.
 * @returns The parsed manifest.
 */
const manifestOf = (deployment: NativeKernelDeployment): PluginDeployment => {
  let parsed = parsedManifests.get(deployment);
  if (parsed === undefined) {
    parsed = parsePluginDeployment(deployment.manifest, `${deployment.package} tau-plugin.json`);
    parsedManifests.set(deployment, parsed);
  }
  return parsed;
};

/**
 * The dependencies a deployment's kernel requires.
 * @param deployment - The deployment.
 * @param kernel - The kernel id.
 * @returns The dependencies, in manifest order.
 * @throws {TypeError} When the manifest declares no such kernel.
 */
const requiresOf = (deployment: NativeKernelDeployment, kernel: string): readonly string[] => {
  const { kernels } = manifestOf(deployment);
  if (!Object.hasOwn(kernels, kernel)) {
    throw new TypeError(`${deployment.package}'s tau-plugin.json declares no kernel '${kernel}'.`);
  }
  return kernels[kernel]!.requires;
};

/**
 * The native kernel packages a resolved runtime lists, one row per package in list order: every kernel registration
 * that carries a deployment (`withNativeDeployment`), grouped by its package.
 * @param runtime - The resolved runtime, as `resolveRuntimeDefinition` returns it.
 * @returns The rows; empty for a runtime with no native kernel.
 * @public
 */
export const nativeDeploymentsOf = (runtime: ResolvedRuntimeKernels): readonly NativeKernelDeploymentRow[] => {
  const rows = new Map<string, { deployment: NativeKernelDeployment; kernels: NativeKernelRow[] }>();
  for (const kernel of runtime.kernels) {
    const deployment = nativeDeploymentOf(kernel);
    if (deployment !== undefined) {
      const row = rows.get(deployment.package) ?? { deployment, kernels: [] };
      rows.set(deployment.package, row);
      row.kernels.push({ id: kernel.id, extensions: kernel.extensions, requires: requiresOf(deployment, kernel.id) });
    }
  }
  return [...rows.values()];
};

const directoryOf = (packageRoot: string): string => fileURLToPath(packageRoot).replace(/[/\\]$/u, '');

/**
 * The preparation plugins of native deployments: each package's parsed `tau-plugin.json`, its root (which payloads
 * shipped inside the package resolve against), its seal step and its launch set. No kernel code runs.
 * @param deployments - The deployments, in order.
 * @returns One preparation plugin per deployment.
 * @public
 */
export const preparationPluginsOf = (deployments: readonly NativeKernelDeployment[]): readonly PreparationPlugin[] =>
  deployments.map((deployment) => ({
    package: deployment.package,
    deployment: manifestOf(deployment),
    directory: directoryOf(deployment.packageRoot),
    ...(deployment.seal && { seal: deployment.seal }),
    launchSet: deployment.launchSet,
  }));

/**
 * Every kernel the deployments declare that can be prepared, with the extensions it handles.
 * @param deployments - The deployments, in order.
 * @returns Kernel ids and extensions, in deployment then manifest order.
 * @public
 */
export const preparableKernels = (
  deployments: readonly NativeKernelDeployment[],
): ReadonlyArray<{ readonly kernel: string; readonly extensions: readonly string[] }> =>
  deployments.flatMap((deployment) =>
    Object.entries(manifestOf(deployment).kernels).map(([kernel, { extensions }]) => ({ kernel, extensions })),
  );

/**
 * The native kernels this host can run: each declared kernel whose every required dependency has a variant for the
 * host's indicators.
 * @param deployments - The deployments, in order.
 * @param indicators - The host, from `detectHostIndicators`.
 * @returns Kernel ids, in deployment then manifest order.
 * @public
 */
export const nativeKernelIdsSupportedOn = (
  deployments: readonly NativeKernelDeployment[],
  indicators: HostIndicators,
): readonly string[] =>
  deployments.flatMap((deployment) => {
    const manifest = manifestOf(deployment);
    return Object.entries(manifest.kernels)
      .filter(([, { requires }]) =>
        requires.every(
          (dependency) => selectVariant(manifest.dependencies[dependency] ?? [], indicators).status === 'selected',
        ),
      )
      .map(([kernel]) => kernel);
  });

/**
 * A closure re-verifier for native workers launched from the payload store: a worker that exits before its handshake
 * re-verifies its closure against the receipt beside it, so the refusal names the damaged file. A root without a
 * receipt was a sealed closure when it was bound, so a repair that stopped half way is named as `receipt.json`.
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
 * What a kernel asks for when it binds to its sealed closure.
 * @public
 */
export type NativeClosureRequest = {
  /** The kernel's npm package. */
  readonly package: string;
  /** Kernel id. */
  readonly kernel: string;
  /** The dependencies its closure is sealed from. */
  readonly dependencies: readonly string[];
  /** The package's deployment. */
  readonly deployment: NativeKernelDeployment;
};

/**
 * Why a kernel's closure cannot be bound here.
 * @public
 */
export type NativeClosureRefusal = {
  readonly status: 'unavailable';
  /** `not-prepared`: preparing fixes it. `unsupported-target`: the package declares no runtime for this host. */
  readonly reason: 'not-prepared' | 'unsupported-target';
  /** Bytes preparing downloads on this host: the selected variants' payloads. Zero when unsupported. */
  readonly byteLength: number;
  /** For `unsupported-target`, the preparation host's own explanation. */
  readonly detail?: string;
  /** A host's own wording for the refusal, used as the issue's message in place of the default one. */
  readonly refusal?: string;
};

/**
 * A closure resolver's answer: each required dependency's sealed closure, or why there is none.
 * @public
 */
export type NativeClosureAnswer =
  | { readonly status: 'ready'; readonly closures: Readonly<Record<string, ClosureLaunch>> }
  | NativeClosureRefusal;

/**
 * Finds a kernel's sealed closure. A host whose runtime cannot read the payload store installs one that asks a
 * process that can.
 * @public
 */
export type NativeClosureResolver = (request: NativeClosureRequest) => Promise<NativeClosureAnswer>;

/*
 * The resolver slot sits on `globalThis` under a registered symbol, so every copy of this package in one realm reads
 * the one a host installed, as the native launcher and verifier slots do.
 */
const resolverSlot = Symbol.for('@taucad/native-process-core/closure-resolver');

/**
 * Install the closure resolver every native kernel in this realm binds through, or remove it with `undefined`.
 * Without one, a kernel reads the default payload store itself ({@link storeClosureResolver}).
 * @param resolver - The resolver.
 * @public
 */
export const installNativeClosureResolver = (resolver: NativeClosureResolver | undefined): void => {
  Reflect.set(globalThis, resolverSlot, resolver);
};

const installedResolver = (): NativeClosureResolver | undefined => {
  const resolver: unknown = Reflect.get(globalThis, resolverSlot);
  return typeof resolver === 'function' ? (resolver as NativeClosureResolver) : undefined;
};

/*
 * Closures are bound by the store's real path. The native sandbox denies reads under shared roots such as `/tmp`
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

// The bytes preparing a kernel downloads on this host: the payloads of the variant each required dependency selects.
const preparationBytes = (
  manifest: PluginDeployment,
  requires: readonly string[],
  managed: ManagedPreparation,
): number => {
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    return 0;
  }
  let byteLength = 0;
  for (const dependency of requires) {
    const selection = selectVariant(manifest.dependencies[dependency] ?? [], indicators, managed.selection);
    for (const payload of selection.status === 'selected' ? selection.variant.payloads : []) {
      byteLength += payload.byteLength;
    }
  }
  return byteLength;
};

/**
 * Read a kernel's sealed closure from the store's launch index: nothing is downloaded, no closure is verified and no
 * full receipt is parsed.
 * @param input - The store (its real path), the managed profile and the request.
 * @returns The answer.
 */
const inspectStore = async (
  input: NativeStoreInput & Pick<NativeClosureRequest, 'deployment' | 'dependencies'>,
): Promise<NativeClosureAnswer> => {
  const [plugin] = preparationPluginsOf([input.deployment]);
  // An inspect-only host starts no attempt and holds nothing to dispose.
  const host = createPreparationHost({
    plugins: [plugin!],
    store: input.store,
    ...(input.managed.seed === undefined ? {} : { seed: input.managed.seed }),
    selection: input.managed.selection,
  });
  const state = await host.inspectLaunch({ package: input.deployment.package, dependencies: input.dependencies });
  if (state.status === 'ready' && input.dependencies.every((dependency) => state.closures[dependency] !== undefined)) {
    return { status: 'ready', closures: state.closures };
  }
  const unsupported = state.status === 'blocked' && state.reason === 'unsupported-target';
  return {
    status: 'unavailable',
    reason: unsupported ? 'unsupported-target' : 'not-prepared',
    byteLength: unsupported ? 0 : preparationBytes(plugin!.deployment, input.dependencies, input.managed),
    ...(unsupported ? { detail: state.message } : {}),
  };
};

/**
 * The default closure resolver: read the payload store's launch index in this process. When a closure is ready, the
 * store's closure re-verifier is installed, so a worker that exits before its handshake names what differs.
 * @param input - The payload store (default: {@link defaultPayloadStore}) and the managed profile (default:
 *   `readManagedPreparation(process.env)`).
 * @returns The resolver.
 * @public
 */
export const storeClosureResolver = (
  input: { readonly store?: string; readonly managed?: ManagedPreparation } = {},
): NativeClosureResolver => {
  let store: Promise<string> | undefined;
  return async ({ deployment, dependencies }) => {
    store ??= realStore(input.store ?? defaultPayloadStore());
    const answer = await inspectStore({
      store: await store,
      managed: input.managed ?? readManagedPreparation(process.env),
      deployment,
      dependencies,
    });
    if (answer.status === 'ready') {
      installNativeRuntimeVerifier(verifyStoreClosure(defaultRemedy));
    }
    return answer;
  };
};

/**
 * One declared kernel's closure state, as a process that can read the store reports it to one that cannot.
 * @public
 */
export type NativeKernelInspectionRow = {
  readonly package: string;
  readonly kernel: string;
  readonly extensions: readonly string[];
  readonly answer: NativeClosureAnswer;
};

/**
 * Every declared kernel's closure state. Serialisable.
 * @public
 */
export type NativeKernelInspection = readonly NativeKernelInspectionRow[];

const receiptFileSchema = z.object({
  path: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
  mode: z.number().int(),
  symlinkTarget: z.string().optional(),
});

const closureLaunchSchema = z.object({
  package: z.string().min(1),
  dependency: z.string().min(1),
  root: z.string().min(1),
  closureIntegrity: z.string().min(1),
  files: z.array(receiptFileSchema),
});

/**
 * Parses a {@link NativeClosureAnswer} received from another process.
 * @public
 */
export const nativeClosureAnswerSchema: z.ZodType<NativeClosureAnswer> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), closures: z.record(z.string(), closureLaunchSchema) }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum(['not-prepared', 'unsupported-target']),
    byteLength: z.number().int().nonnegative(),
    detail: z.string().optional(),
    refusal: z.string().optional(),
  }),
]) as z.ZodType<NativeClosureAnswer>;

/**
 * Parses a {@link NativeKernelInspection} received from another process.
 * @public
 */
export const nativeInspectionSchema: z.ZodType<NativeKernelInspection> = z.array(
  z.object({
    package: z.string().min(1),
    kernel: z.string().min(1),
    extensions: z.array(z.string()),
    answer: nativeClosureAnswerSchema,
  }),
);

/**
 * Read every kernel the deployments declare from the payload store's launch indexes, for a process whose runtime
 * cannot read the store. Nothing is downloaded.
 * @param input - The deployments, the payload store and the managed profile.
 * @returns One row per declared kernel, in deployment then manifest order.
 * @public
 */
export const inspectNativeKernels = async (
  input: NativeStoreInput & { readonly deployments: readonly NativeKernelDeployment[] },
): Promise<NativeKernelInspection> => {
  const store = await realStore(input.store);
  const rows: NativeKernelInspectionRow[] = [];
  for (const deployment of input.deployments) {
    for (const [kernel, { requires, extensions }] of Object.entries(manifestOf(deployment).kernels)) {
      // oxlint-disable-next-line no-await-in-loop -- a few small launch indexes, read in order
      const answer = await inspectStore({ store, managed: input.managed, deployment, dependencies: requires });
      rows.push({ package: deployment.package, kernel, extensions, answer });
    }
  }
  return rows;
};

/**
 * A closure resolver that answers from another process's inspection.
 * @param inspection - What the process that reads the store reported.
 * @returns The resolver; a kernel the inspection does not name is not prepared.
 * @public
 */
export const inspectionResolver =
  (inspection: NativeKernelInspection): NativeClosureResolver =>
  async (request) =>
    inspection.find((row) => row.package === request.package && row.kernel === request.kernel)?.answer ?? {
      status: 'unavailable',
      reason: 'not-prepared',
      byteLength: 0,
    };

const megabytes = (byteLength: number): string => `${String(Math.round(byteLength / 1e6))} MB`;

/**
 * The issue a native kernel refuses every operation with while its closure cannot be bound.
 * @param input - The kernel, its package, the extensions it handles and the resolver's refusal.
 * @returns `KERNEL_NOT_PREPARED`, or `KERNEL_CAPABILITY_MISSING` on a host the kernel declares no runtime for.
 * @public
 */
export const unpreparedKernelIssue = (input: {
  readonly kernel: string;
  readonly package: string;
  readonly extensions: readonly string[];
  readonly refusal: NativeClosureRefusal;
}): KernelIssue => {
  const { kernel, refusal } = input;
  const extension = input.extensions.map((handled) => `.${handled}`).join('", "');
  if (refusal.reason === 'unsupported-target') {
    return {
      code: 'KERNEL_CAPABILITY_MISSING',
      type: 'kernel',
      severity: 'error',
      message:
        refusal.refusal ??
        `${kernel} handles "${extension}" but cannot run on this machine. ${refusal.detail ?? ''}`.trimEnd(),
      details: { kernel, package: input.package, extension, reason: refusal.reason },
    };
  }
  return {
    code: 'KERNEL_NOT_PREPARED',
    type: 'kernel',
    severity: 'error',
    message:
      refusal.refusal ??
      `${kernel} handles "${extension}" but its runtime (${megabytes(refusal.byteLength)}) is not prepared on this machine. ` +
        `Call prepare_kernel with { "kernel": "${kernel}" } (or run \`tau prepare ${kernel}\`), then evaluate again.`,
    details: {
      kernel,
      package: input.package,
      extension,
      byteLength: refusal.byteLength,
      prepare: { tool: 'prepare_kernel', input: { kernel } },
    },
  };
};

/**
 * A native kernel's closure cannot be bound; `issues[0]` is the refusal the runtime forwards to the client. The
 * runtime retries `initialize` on the next operation, so preparing the kernel is enough.
 * @public
 */
export class UnpreparedKernelError extends Error {
  public override readonly name = 'UnpreparedKernelError';
  public readonly issues: KernelIssue[];

  public constructor(issue: KernelIssue) {
    super(issue.message);
    this.issues = [issue];
  }
}

/**
 * A native kernel's options bound to a closure.
 * @public
 */
export type BoundNativeKernel<Options, Bounds> = {
  /** The closure's options with the host's bounds. */
  readonly options: Options & Omit<Bounds, 'closure'>;
  /** The sealed closure the kernel runs from; absent for an explicit closure. */
  readonly closureRoot?: string;
};

/**
 * Bind a native kernel to its closure, in `initialize`: an explicit `options.closure` wins; otherwise the installed
 * closure resolver (or, without one, the default payload store) finds the sealed closure and the deployment maps it
 * to options. The host's bounds are kept either way.
 * @param input - The package's deployment, the kernel id and the kernel's parsed options.
 * @returns The bound options.
 * @throws {UnpreparedKernelError} When the closure is not prepared or the host is not a target of the package.
 * @public
 * @example <caption>A kernel's initialize</caption>
 * ```typescript
 * import { bindNativeKernel } from '@taucad/native-process-core/store';
 *
 * const { options: bound } = await bindNativeKernel({ deployment: rustcadNative, kernel: 'rustcad', options });
 * ```
 */
export const bindNativeKernel = async <
  Options extends Record<string, unknown>,
  Closure extends Record<string, unknown>,
  Bounds extends NativeKernelBounds,
>(input: {
  readonly deployment: NativeKernelDeployment<Options>;
  readonly kernel: string;
  readonly options: Bounds & { readonly closure?: Closure | undefined };
}): Promise<BoundNativeKernel<Options | Closure, Bounds>> => {
  const { closure, ...bounds } = input.options;
  if (closure !== undefined) {
    return { options: { ...closure, ...bounds } };
  }
  const { deployment, kernel } = input;
  const dependencies = requiresOf(deployment, kernel);
  const resolve = installedResolver() ?? storeClosureResolver();
  const answer = await resolve({ package: deployment.package, kernel, dependencies, deployment });
  const sealed = answer.status === 'ready' ? answer.closures[dependencies[0]!] : undefined;
  if (answer.status === 'ready' && sealed !== undefined) {
    return { options: { ...deployment.optionsFromClosure(sealed), ...bounds }, closureRoot: sealed.root };
  }
  throw new UnpreparedKernelError(
    unpreparedKernelIssue({
      kernel,
      package: deployment.package,
      extensions: manifestOf(deployment).kernels[kernel]!.extensions,
      refusal:
        answer.status === 'unavailable' ? answer : { status: 'unavailable', reason: 'not-prepared', byteLength: 0 },
    }),
  );
};

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
   * Prepare a kernel by id.
   * @throws {UnknownNativeKernelError} When no deployment declares it.
   */
  readonly prepare: (
    kernel: string,
    context: { readonly signal: AbortSignal; readonly onProgress?: (progress: PrepareKernelProgress) => void },
  ) => Promise<PrepareKernelOutput>;
  readonly dispose: () => Promise<void>;
};

/**
 * No deployment declares the kernel a caller asked to prepare; `known` names those that can be prepared.
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
 * Open the preparation host a long-lived process prepares native kernels through: the deployments with their seal
 * steps, the payload store and the managed profile, with the process's unrestricted `fetch` unless one is given.
 * Verified payloads persist, so a cancelled or failed call leaves the next one only the remainder to download.
 * @param input - The deployments, the payload store, the managed profile and, for tests, the transport.
 * @returns The preparation and its disposal.
 * @public
 */
export const openNativePreparation = (
  input: NativeStoreInput & { readonly deployments: readonly NativeKernelDeployment[]; readonly fetch?: typeof fetch },
): NativePreparation => {
  let opened: Promise<{ host: PreparationHost; plugins: readonly PreparationPlugin[] }> | undefined;
  const open = async () => {
    const { managed } = input;
    const plugins = preparationPluginsOf(input.deployments);
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

/**
 * The serialisable report a runtime thread or child sends its parent after it built its runtime: enough to prepare
 * each native kernel without loading kernel code.
 * @public
 */
export type NativeDeploymentReport = ReadonlyArray<{
  /** The npm package. */
  readonly package: string;
  /** `file:` URL of the light module that exports the deployment. */
  readonly entry: string;
  /** `file:` URL of the package root. */
  readonly packageRoot: string;
  /** The package's unparsed `tau-plugin.json`. */
  readonly manifest: unknown;
  /** The kernels of the package the runtime routes. */
  readonly kernels: readonly string[];
}>;

/**
 * Parses a {@link NativeDeploymentReport} received from another process.
 * @public
 */
export const nativeDeploymentReportSchema: z.ZodType<NativeDeploymentReport> = z.array(
  z.object({
    package: z.string().min(1),
    entry: z.string().min(1),
    packageRoot: z.string().min(1),
    manifest: z.unknown(),
    kernels: z.array(z.string().min(1)),
  }),
);

/**
 * The report of the native deployments a resolved runtime lists.
 * @param runtime - The resolved runtime.
 * @returns One row per package, in list order.
 * @public
 */
export const reportNativeDeployments = (runtime: ResolvedRuntimeKernels): NativeDeploymentReport =>
  nativeDeploymentsOf(runtime).map(({ deployment, kernels }) => ({
    package: deployment.package,
    entry: deployment.entry,
    packageRoot: deployment.packageRoot,
    manifest: deployment.manifest,
    kernels: kernels.map(({ id }) => id),
  }));

const isDeployment = (value: unknown): value is NativeKernelDeployment =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'package') === 'string' &&
  typeof Reflect.get(value, 'launchSet') === 'function' &&
  typeof Reflect.get(value, 'optionsFromClosure') === 'function' &&
  Reflect.has(value, 'manifest');

/**
 * Re-hydrate another process's report: import each row's light deployment module by its file URL (never by package
 * name from this process's own graph) and take the export whose `package` the row names, so the seal step and the
 * launch set run here without kernel code.
 * @param report - The report.
 * @returns The deployments, in report order.
 * @throws {TypeError} When a row's module exports no deployment of its package.
 * @public
 */
export const loadReportedDeployments = async (
  report: NativeDeploymentReport,
): Promise<readonly NativeKernelDeployment[]> =>
  Promise.all(
    report.map(async (row) => {
      const module = (await import(row.entry)) as Readonly<Record<string, unknown>>;
      const deployment = Object.values(module).find(
        (value): value is NativeKernelDeployment => isDeployment(value) && value.package === row.package,
      );
      if (deployment === undefined) {
        throw new TypeError(`${row.entry} exports no native kernel deployment of ${row.package}.`);
      }
      return deployment;
    }),
  );
