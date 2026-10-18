import { resolve } from 'node:path';

import { defaultPayloadStore } from '@taucad/host';
import {
  createPreparationHost,
  describeEffectiveProfile,
  detectHostIndicators,
  PreparationError,
} from '@taucad/runtime/preparation/node';
import type {
  ClosureReceipt,
  ClosureVerification,
  HostIndicators,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
  PrepareOutcome,
} from '@taucad/runtime/preparation/node';
import { defineCommand } from 'citty';
import type { ArgsDef, CommandDef, ParsedArgs } from 'citty';
import type { ConsolaInstance } from 'consola';

import {
  auditClosure,
  auditDirectory,
  exportBlobs,
  exportManifest,
  indexedPackages,
  readPluginSbom,
  readSeedIndex,
  readSupplementalNotices,
  verifySeed,
  writeAuditUnit,
  writeSeedIndex,
} from '#commands/prepare-seed.js';
import type { ClosureAudit, SeedClosure } from '#commands/prepare-seed.js';
import { describeRuntime, preparationPluginsFor, readManaged } from '#native-kernels.js';
import { cliError, createOutput, emit, exitCodes, sanitize, writeStdout } from '#output.js';

/** Progress lines on stderr are written at most this often. Milliseconds. */
const progressInterval = 1000;

const megabytes = (byteLength: number): string => `${(byteLength / 1e6).toFixed(1)} MB`;

const kernelsOf = (plugins: readonly PreparationPlugin[]): string[] =>
  plugins.flatMap((plugin) => Object.keys(plugin.deployment.kernels)).toSorted();

const findKernel = (
  plugins: readonly PreparationPlugin[],
  kernel: string,
): { readonly plugin: PreparationPlugin; readonly dependencies: readonly string[] } => {
  for (const plugin of plugins) {
    const row = plugin.deployment.kernels[kernel];
    if (row !== undefined) {
      return { plugin, dependencies: row.requires };
    }
  }
  const known = kernelsOf(plugins);
  throw cliError(
    'UNKNOWN_KERNEL',
    `No native kernel is called '${sanitize(kernel)}'. Kernels that can be prepared: ${known.length === 0 ? 'none are installed' : known.join(', ')}.`,
    exitCodes.usage,
  );
};

const preparationFailure = (error: unknown): unknown =>
  error instanceof PreparationError
    ? cliError(error.code, error.message, { exit: exitCodes.refused, details: { code: error.code } })
    : error;

// The scripted failure for an outcome that is not `ready`.
const refusal = (
  kernel: string,
  outcome: Exclude<PrepareOutcome, { status: 'ready' }>,
  stoppedBy: NodeJS.Signals | undefined,
): Error => {
  if (outcome.status === 'cancelled') {
    return cliError(
      'PREPARATION_CANCELLED',
      `Preparing ${kernel} was cancelled${stoppedBy === undefined ? '' : ` by ${stoppedBy}`}; verified payloads are kept, so the next run downloads only the rest.`,
      stoppedBy === 'SIGTERM' ? exitCodes.terminated : exitCodes.interrupted,
    );
  }
  const code =
    outcome.reason === 'offline-miss'
      ? 'OFFLINE_MISS'
      : outcome.reason === 'unsupported-target'
        ? 'UNSUPPORTED_TARGET'
        : 'MISSING_SYSTEM_LIBRARY';
  return cliError(code, outcome.message, { exit: exitCodes.refused, details: outcome });
};

/**
 * Injected collaborators: the preparation plugins (by default, the native deployments the runtime definition lists),
 * the transport and the host installation path; tests replace all three.
 */
export type PrepareCommandOptions = {
  readonly plugins?: () => Promise<readonly PreparationPlugin[]>;
  readonly fetch?: typeof fetch;
  readonly hostPath?: string;
};

const prepareArgs = {
  kernel: {
    type: 'positional',
    description: 'Native kernel to prepare, as a KERNEL_NOT_PREPARED refusal names it (one the runtime lists)',
    required: false,
  },
  plugin: {
    type: 'string',
    description: 'Additional plugin specifier whose native kernels to prepare (repeatable)',
    required: false,
  },
  config: {
    type: 'string',
    description: 'Path to a tau.config module that exports plugins',
    required: false,
  },
  offline: {
    type: 'boolean',
    description: 'Use the store and the seed only; a miss exits 3 with no request made',
    default: false,
  },
  inspect: {
    type: 'boolean',
    description: 'Print the effective acquisition profile and what the store holds, without preparing',
    default: false,
  },
  verify: {
    type: 'boolean',
    description: 'Re-verify every file of the prepared closures and repair the payloads that differ',
    default: false,
  },
  gc: {
    type: 'boolean',
    description: 'Remove closures no Tau installation uses, orphan blobs and abandoned staging',
    default: false,
  },
  'dry-run': {
    type: 'boolean',
    description: 'With --gc, report what would be removed and remove nothing',
    default: false,
  },
  bundle: {
    type: 'string',
    description:
      'Prepare the kernel (every kernel this host supports when none is named) and export its payloads, manifest and audit unit into this seed directory',
    required: false,
  },
  seed: {
    type: 'string',
    description: 'Prepare from this seed directory with no request: the kernel named, or every kernel the seed indexes',
    required: false,
  },
  'verify-seed': {
    type: 'string',
    description:
      'Check a seed directory before importing it: every blob, pin, closure identity and audit unit; nothing is prepared',
    required: false,
  },
  audit: {
    type: 'boolean',
    description:
      'Audit every prepared closure with no request: files against the receipt, the SBOM and the licence notices',
    default: false,
  },
  json: {
    type: 'boolean',
    description: 'Print one machine-readable record on stdout',
    default: false,
  },
} as const satisfies ArgsDef;

const verifyLine = (row: ClosureVerification): string =>
  `${row.package} ${row.dependency}: ${row.status}${row.payloads.length === 0 ? '' : ` (${row.payloads.join(', ')})`}`;

type Arguments = ParsedArgs<typeof prepareArgs>;

/**
 * The preparation plugins of every native kernel the runtime lists (built-ins plus `--plugin` and `--config`), learned
 * from a thread that builds it: no kernel module loads in this process.
 * @param args - The parsed arguments.
 * @returns One preparation plugin per native deployment, in list order.
 */
const describedPlugins = async (args: Arguments): Promise<readonly PreparationPlugin[]> => {
  const { report } = await describeRuntime({
    projectRoot: process.cwd(),
    ...(args.plugin === undefined ? {} : { plugin: [args.plugin].flat() }),
    ...(args.config === undefined ? {} : { config: args.config }),
  });
  return preparationPluginsFor(report);
};

/** What every verb shares once the host is composed. */
type Session = {
  readonly args: Arguments;
  readonly host: PreparationHost;
  readonly plugins: readonly PreparationPlugin[];
  readonly store: string;
  readonly indicators: HostIndicators | undefined;
  readonly managed: ManagedPreparation;
  /** `--seed`: prepare from the store and the seed only, as `TAU_ACQUISITION=locked` with `TAU_PAYLOAD_DIR` does. */
  readonly offline: boolean;
  readonly signal: AbortSignal;
  readonly stoppedBy: () => NodeJS.Signals | undefined;
};

const inspect = async ({ args, host, store, indicators, managed }: Session): Promise<void> => {
  const profile = await describeEffectiveProfile({
    host,
    store,
    indicators,
    managed,
    environment: process.env,
    execArgv: process.execArgv,
  });
  if (args.json) {
    await emit({ kind: 'profile', ...profile });
    return;
  }
  const rows = profile.closures.map(
    (row) =>
      `${row.package} ${row.dependency}: ${row.state}${row.byteLength === undefined ? '' : ` (${megabytes(row.byteLength)})`}`,
  );
  const variables = profile.variables.length === 0 ? [] : [`variables ${profile.variables.join(', ')}`];
  await writeStdout(
    `${[`profile ${profile.profile}${profile.noFallback ? ' (no fallback)' : ''}, store ${profile.store}`, ...variables, ...rows].join('\n')}\n`,
  );
};

const collectGarbage = async ({ args, host, signal }: Session): Promise<void> => {
  const report = await host.collectGarbage({ dryRun: args['dry-run'], signal });
  await (args.json
    ? emit({ kind: 'gc', ...report })
    : writeStdout(
        `${report.dryRun ? 'Would remove' : 'Removed'} ${String(report.closures.length)} closures, ${String(report.blobs.length)} blobs and ${String(report.staging.length)} staging directories (${megabytes(report.byteLength)}).\n`,
      ));
};

const verify = async ({ args, host, plugins, managed, signal }: Session): Promise<void> => {
  const targets =
    args.kernel === undefined
      ? plugins.map((plugin) => ({ plugin, dependencies: undefined }))
      : [findKernel(plugins, args.kernel)];
  const rows: ClosureVerification[] = [];
  for (const target of targets) {
    // oxlint-disable-next-line no-await-in-loop -- closures are verified one plugin at a time
    const verified = await host.verify({
      package: target.plugin.package,
      ...(target.dependencies === undefined ? {} : { dependencies: target.dependencies }),
      repair: true,
      offline: args.offline || managed.offline,
      signal,
    });
    rows.push(...verified);
  }
  await (args.json
    ? emit({ kind: 'verify', closures: rows })
    : writeStdout(
        rows.length === 0 ? 'No native kernels are installed.\n' : `${rows.map((row) => verifyLine(row)).join('\n')}\n`,
      ));
  const stale = rows.filter((row) => row.status === 'stale');
  if (stale.length > 0) {
    throw cliError(
      'RECEIPT_STALE',
      `${stale.map((row) => `${row.package} ${row.dependency}`).join(', ')} differ from their receipts and could not be repaired offline. Run tau prepare without --offline.`,
      { exit: exitCodes.refused, details: stale },
    );
  }
};

/** The sealed closures of the kernels a verb covers: one kernel's dependencies, or every dependency of every plugin. */
const sealedReceipts = async (
  { host, plugins }: Pick<Session, 'host' | 'plugins'>,
  kernel: string | undefined,
): Promise<Array<{ readonly plugin: PreparationPlugin; readonly receipt: ClosureReceipt }>> => {
  const targets =
    kernel === undefined
      ? plugins.map((plugin) => ({ plugin, dependencies: undefined }))
      : [findKernel(plugins, kernel)];
  const sealed: Array<{ readonly plugin: PreparationPlugin; readonly receipt: ClosureReceipt }> = [];
  for (const { plugin, dependencies } of targets) {
    // oxlint-disable-next-line no-await-in-loop -- closures are read one plugin at a time
    const { state } = await host.inspect({
      package: plugin.package,
      ...(dependencies === undefined ? {} : { dependencies }),
    });
    if (state.status === 'ready') {
      sealed.push(...Object.values(state.receipts).map((receipt) => ({ plugin, receipt })));
    }
  }
  return sealed;
};

const auditLine = (row: ClosureAudit): string => {
  const gaps = [
    ...(row.files === 'intact' ? [] : ['files differ from the receipt']),
    ...(row.sbom.length === 0 ? [] : [`no SBOM component for ${row.sbom.join(', ')}`]),
    ...(row.notices.length === 0 ? [] : [`no notices for ${row.notices.join(', ')}`]),
  ];
  return `${row.package} ${row.dependency}: ${row.ok ? 'ok' : gaps.join('; ')} (${String(row.noticeFiles.length)} notice files)`;
};

/** Audit sealed closures: re-verify every file offline, then check the SBOM and the notices (D26). */
const auditReceipts = async (
  session: Session,
  sealed: ReadonlyArray<{ readonly plugin: PreparationPlugin; readonly receipt: ClosureReceipt }>,
): Promise<ClosureAudit[]> => {
  const rows: ClosureAudit[] = [];
  for (const { plugin, receipt } of sealed) {
    // oxlint-disable-next-line no-await-in-loop -- closures are audited one at a time
    const [verified] = await session.host.verify({
      package: plugin.package,
      dependencies: [receipt.dependency],
      offline: true,
      signal: session.signal,
    });
    rows.push(
      auditClosure({
        plugin,
        // oxlint-disable-next-line no-await-in-loop -- see above
        sbom: await readPluginSbom(plugin),
        // oxlint-disable-next-line no-await-in-loop -- see above
        supplemental: await readSupplementalNotices(plugin),
        receipt,
        files: verified?.status === 'intact' ? 'intact' : 'stale',
      }),
    );
  }
  return rows;
};

const auditFailure = (rows: readonly ClosureAudit[]): Error | undefined => {
  const failed = rows.filter((row) => !row.ok);
  return failed.length === 0
    ? undefined
    : cliError(
        'AUDIT_FAILED',
        `${failed.map((row) => auditLine(row)).join('\n')}\nRun tau prepare --verify to repair files; a missing SBOM component or notice is a packaging defect of the plugin.`,
        { exit: exitCodes.refused, details: failed },
      );
};

const audit = async (session: Session): Promise<void> => {
  const rows = await auditReceipts(session, await sealedReceipts(session, session.args.kernel));
  await (session.args.json
    ? emit({ kind: 'audit', ok: rows.every((row) => row.ok), closures: rows })
    : writeStdout(
        rows.length === 0 ? 'No native kernel is prepared.\n' : `${rows.map((row) => auditLine(row)).join('\n')}\n`,
      ));
  const failure = auditFailure(rows);
  if (failure !== undefined) {
    throw failure;
  }
};

/** The kernels a bundle or a seed covers when none is named. */
const coveredKernels = async (session: Session, packages?: readonly string[]): Promise<string[]> => {
  const described = await session.host.describe();
  const unsupported = new Set(
    described.filter((row) => row.state === 'unsupported').map((row) => `${row.package}\u0000${row.dependency}`),
  );
  return session.plugins
    .filter((plugin) => packages === undefined || packages.includes(plugin.package))
    .flatMap((plugin) =>
      Object.entries(plugin.deployment.kernels)
        .filter(([, row]) =>
          row.requires.every((dependency) => !unsupported.has(`${plugin.package}\u0000${dependency}`)),
        )
        .map(([kernel]) => kernel),
    )
    .toSorted();
};

/** Prepare one kernel and return its receipts, or throw the scripted refusal. */
const prepareKernel = async (
  session: Session,
  kernel: string,
  output: ConsolaInstance,
): Promise<[ClosureReceipt, ...ClosureReceipt[]]> => {
  const { args, host, plugins, managed, signal } = session;
  const { plugin, dependencies } = findKernel(plugins, kernel);
  let reported = 0;
  const unsubscribe = host.on('preparation', ({ selection, state }) => {
    const now = Date.now();
    if (
      args.json ||
      selection.package !== plugin.package ||
      state.status !== 'preparing' ||
      now - reported < progressInterval
    ) {
      return;
    }
    reported = now;
    output.info(
      sanitize(
        `${state.phase} ${state.payload} (${megabytes(state.completedBytes)} of ${megabytes(state.totalBytes)}, ${String(state.completedPayloads)}/${String(state.totalPayloads)} payloads)`,
      ),
    );
  });
  let outcome: PrepareOutcome;
  try {
    outcome = await host.prepare({
      package: plugin.package,
      dependencies,
      offline: args.offline || session.offline || managed.offline,
      signal,
    });
  } catch (error) {
    throw preparationFailure(error);
  } finally {
    unsubscribe();
  }
  if (outcome.status !== 'ready') {
    throw refusal(kernel, outcome, session.stoppedBy());
  }
  const [first, ...rest] = dependencies.flatMap((dependency) => outcome.receipts[dependency] ?? []);
  if (first === undefined) {
    throw new Error(
      `${kernel} is ready but holds no receipt; the store at ${session.store} is inconsistent. Run tau prepare --verify.`,
    );
  }
  return [first, ...rest];
};

/** `--bundle <dir>`: prepare, audit, then export each closure's blobs, manifest and audit unit, and index them. */
const bundle = async (session: Session, directory: string, output: ConsolaInstance): Promise<void> => {
  const kernels = session.args.kernel === undefined ? await coveredKernels(session) : [session.args.kernel];
  if (kernels.length === 0) {
    throw cliError('NOTHING_TO_BUNDLE', 'No native kernel runs on this host, so there is nothing to bundle.', {
      exit: exitCodes.refused,
    });
  }
  const sealed = new Map<string, { readonly plugin: PreparationPlugin; readonly receipt: ClosureReceipt }>();
  for (const kernel of kernels) {
    const { plugin } = findKernel(session.plugins, kernel);
    // oxlint-disable-next-line no-await-in-loop -- kernels are prepared one at a time
    for (const receipt of await prepareKernel(session, kernel, output)) {
      sealed.set(receipt.closureIntegrity, { plugin, receipt });
    }
  }
  const rows = await auditReceipts(session, [...sealed.values()]);
  const failure = auditFailure(rows);
  if (failure !== undefined) {
    throw failure;
  }
  const closures: SeedClosure[] = [];
  for (const [index, { plugin, receipt }] of [...sealed.values()].entries()) {
    const row = rows[index];
    // oxlint-disable-next-line no-await-in-loop -- one closure at a time on one disk
    const payloads = await exportBlobs({ store: session.store, directory, plugin, receipt });
    // oxlint-disable-next-line no-await-in-loop -- see above
    const version = await exportManifest(directory, plugin);
    // oxlint-disable-next-line no-await-in-loop -- see above
    const sbom = await readPluginSbom(plugin);
    if (sbom !== undefined && row !== undefined) {
      // oxlint-disable-next-line no-await-in-loop -- see above
      await writeAuditUnit({ directory, plugin, receipt, sbom, audit: row });
    }
    closures.push({
      package: receipt.package,
      version,
      dependency: receipt.dependency,
      target: receipt.target,
      closureIntegrity: receipt.closureIntegrity,
      treeIntegrity: receipt.treeIntegrity,
      payloads,
      audit: auditDirectory(receipt.closureIntegrity),
    });
  }
  const [first] = sealed.values();
  const index = await writeSeedIndex(directory, first?.receipt.tauVersion ?? '', closures);
  const byteLength = closures.flatMap((closure) => closure.payloads).reduce((sum, row) => sum + row.byteLength, 0);
  await (session.args.json
    ? emit({ kind: 'bundle', directory, kernels, closures, indexed: index.closures.length, byteLength })
    : writeStdout(
        `Bundled ${kernels.join(', ')} into ${directory}: ${String(closures.length)} closures, ${String(closures.flatMap((closure) => closure.payloads).length)} payloads (${megabytes(byteLength)}).\n`,
      ));
};

/** `--seed <dir>`: prepare the named kernel, or every kernel the seed indexes, with no request. */
const seed = async (session: Session, directory: string, output: ConsolaInstance): Promise<void> => {
  let kernels: string[];
  if (session.args.kernel === undefined) {
    let packages: readonly string[];
    try {
      packages = indexedPackages(await readSeedIndex(directory));
    } catch (error) {
      throw cliError('SEED_INVALID', error instanceof Error ? error.message : String(error), {
        exit: exitCodes.refused,
      });
    }
    kernels = await coveredKernels(session, packages);
  } else {
    kernels = [session.args.kernel];
  }
  const prepared: Array<Pick<ClosureReceipt, 'package' | 'dependency' | 'closureIntegrity' | 'treeIntegrity'>> = [];
  for (const kernel of kernels) {
    // oxlint-disable-next-line no-await-in-loop -- kernels are prepared one at a time
    for (const receipt of await prepareKernel(session, kernel, output)) {
      prepared.push({
        package: receipt.package,
        dependency: receipt.dependency,
        closureIntegrity: receipt.closureIntegrity,
        treeIntegrity: receipt.treeIntegrity,
      });
    }
  }
  await (session.args.json
    ? emit({ kind: 'seed', status: 'ready', directory, kernels, closures: prepared })
    : writeStdout(
        `${kernels.length === 0 ? 'The seed indexes no kernel this host can run.' : `${kernels.join(', ')} prepared from ${directory}.`}\n`,
      ));
};

/** `--verify-seed <dir>`: hash every blob and audit unit of a bundle; refuse when anything is missing or differs. */
const verifySeedDirectory = async (session: Session, directory: string): Promise<void> => {
  const report = await verifySeed(directory);
  await (session.args.json
    ? emit({ kind: 'verify-seed', ok: report.problems.length === 0, ...report })
    : writeStdout(
        `${[
          `${directory}: ${String(report.closures.length)} closures, ${String(report.blobs)} blobs (${megabytes(report.byteLength)}), prepared with Tau ${report.tauVersion || 'unknown'}`,
          ...report.problems.map((problem) => `${problem.path}: ${problem.problem}`),
        ].join('\n')}\n`,
      ));
  if (report.problems.length > 0) {
    throw cliError(
      'SEED_INVALID',
      `${directory} is incomplete or altered: ${String(report.problems.length)} problems. Export it again with tau prepare --bundle.`,
      { exit: exitCodes.refused, details: report.problems },
    );
  }
};

const prepare = async (session: Session, output: ConsolaInstance): Promise<void> => {
  const { args, plugins } = session;
  if (args.kernel === undefined) {
    const known = kernelsOf(plugins);
    throw cliError(
      'ARG_KERNEL_MISSING',
      `Name the kernel to prepare (${known.length === 0 ? 'none are installed' : known.join(', ')}), or pass --inspect, --verify, --audit, --bundle, --seed, --verify-seed or --gc.`,
      exitCodes.usage,
    );
  }
  const { kernel } = args;
  const receipts = await prepareKernel(session, kernel, output);
  const [first] = receipts;
  const byteLength = receipts.flatMap((receipt) => receipt.files).reduce((sum, file) => sum + file.byteLength, 0);
  await (args.json
    ? emit({
        kind: 'prepare',
        status: 'ready',
        kernel,
        closureIntegrity: first.closureIntegrity,
        treeIntegrity: first.treeIntegrity,
        byteLength,
      })
    : writeStdout(`${kernel} is ready (${megabytes(byteLength)}, ${first.closureIntegrity}).\n`));
};

/**
 * The verbs that take a directory: `--verify-seed`, `--bundle` and `--seed`, else an ordinary prepare.
 * @param session - The composed host and arguments.
 * @param output - Progress output.
 * @returns When the verb finishes.
 */
const dispatchDirectory = async (session: Session, output: ConsolaInstance): Promise<void> => {
  const { args } = session;
  if (args['verify-seed'] !== undefined) {
    return verifySeedDirectory(session, resolve(args['verify-seed']));
  }
  if (args.bundle !== undefined) {
    return bundle(session, resolve(args.bundle), output);
  }
  if (args.seed !== undefined) {
    return seed(session, resolve(args.seed), output);
  }
  return prepare(session, output);
};

/**
 * Build `tau prepare` over the runtime definition's native deployments.
 * @param options - Preparation plugins, transport and host path.
 * @returns The `tau prepare` command definition.
 */
export const createPrepareCommand = (options: PrepareCommandOptions = {}): CommandDef<typeof prepareArgs> =>
  defineCommand({
    meta: {
      name: 'prepare',
      description: 'Download, verify and unpack a native kernel’s runtime into the shared payload store',
    },
    args: prepareArgs,
    async run({ args }) {
      const output = await createOutput();
      const managed = readManaged();
      const seedDirectory = args.seed === undefined ? managed.seed : resolve(args.seed);
      const plugins = options.plugins === undefined ? await describedPlugins(args) : await options.plugins();
      const store = defaultPayloadStore();
      const indicators = detectHostIndicators();
      const host = createPreparationHost({
        plugins,
        store,
        ...(indicators === undefined ? {} : { indicators }),
        ...(options.hostPath === undefined ? {} : { hostPath: options.hostPath }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
        ...(seedDirectory === undefined ? {} : { seed: seedDirectory }),
        selection: managed.selection,
      });
      const controller = new AbortController();
      let stoppedBy: NodeJS.Signals | undefined;
      const onSignal = (signal: NodeJS.Signals): void => {
        stoppedBy = signal;
        controller.abort(new Error(`Interrupted by ${signal}`));
      };
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      const session: Session = {
        args,
        host,
        plugins,
        store,
        indicators,
        managed,
        offline: args.seed !== undefined,
        signal: controller.signal,
        stoppedBy: () => stoppedBy,
      };
      try {
        await (args.inspect
          ? inspect(session)
          : args.gc
            ? collectGarbage(session)
            : args.verify
              ? verify(session)
              : args.audit
                ? audit(session)
                : dispatchDirectory(session, output));
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        host.dispose();
      }
    },
  });

/**
 * `tau prepare` command.
 *
 * Prepares a native kernel's runtime (an interpreter, wheels, a .NET runtime) into the payload store every Tau host
 * on this machine shares: each payload is downloaded once, verified against its pinned digest before a byte is
 * written, unpacked and sealed with a receipt. `tau mcp`, `tau export` and the desktop use the result without
 * downloading. It prepares the native kernels the runtime definition lists: the built-ins, plus those of `--plugin` and
 * `--config`, learned from a thread that builds the runtime, so no kernel module loads in this process. Honours
 * `TAU_ACQUISITION`, `TAU_PAYLOAD_MIRROR`, `TAU_PAYLOAD_MIRROR_NO_FALLBACK`, `TAU_PAYLOAD_DIR`,
 * `TAU_PAYLOAD_TARGET`, `TAU_PAYLOAD_EMULATION` and `TAU_CONFIG_DIR`.
 *
 * @example <caption>Prepare, inspect, verify and collect garbage</caption>
 * ```bash
 * tau prepare build123d
 * tau prepare build123d --offline --json
 * tau prepare rustcad --config tau.config.ts
 * tau prepare --inspect --json
 * tau prepare --verify
 * tau prepare --gc --dry-run
 * ```
 */
export const prepareCommand = createPrepareCommand();
