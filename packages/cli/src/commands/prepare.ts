import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { defaultPayloadStore } from '@taucad/host';
import {
  createPreparationHost,
  describeEffectiveProfile,
  detectHostIndicators,
  parsePluginDeployment,
  PreparationError,
  readManagedPreparation,
} from '@taucad/runtime/preparation/node';
import type {
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

import { cliError, createOutput, emit, exitCodes, sanitize, writeStdout } from '#output.js';

/** Packages whose `tau-plugin.json` declares native runtime payloads; each is read without running plugin code. */
const nativePackages = ['@taucad/build123d', '@taucad/picogk'] as const;

/** Progress lines on stderr are written at most this often. Milliseconds. */
const progressInterval = 1000;

const megabytes = (byteLength: number): string => `${(byteLength / 1e6).toFixed(1)} MB`;

/**
 * The native plugins this CLI can prepare: each package that ships a `tau-plugin.json`. A package that is not
 * installed or ships none is skipped, so the roster grows as plugins adopt the manifest.
 * @returns The roster.
 */
const installedPlugins = async (): Promise<readonly PreparationPlugin[]> => {
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
    });
  }
  return plugins;
};

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

const readManaged = (): ManagedPreparation => {
  try {
    return readManagedPreparation(process.env);
  } catch (error) {
    throw cliError('MANAGED_PROFILE_INVALID', error instanceof Error ? error.message : String(error), exitCodes.usage);
  }
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

/** Injected collaborators: the roster, the transport and the host installation path; tests replace all three. */
export type PrepareCommandOptions = {
  readonly plugins?: () => Promise<readonly PreparationPlugin[]>;
  readonly fetch?: typeof fetch;
  readonly hostPath?: string;
};

const prepareArgs = {
  kernel: {
    type: 'positional',
    description: 'Kernel to prepare, such as build123d or picogk',
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
  json: {
    type: 'boolean',
    description: 'Print one machine-readable record on stdout',
    default: false,
  },
} as const satisfies ArgsDef;

const verifyLine = (row: ClosureVerification): string =>
  `${row.package} ${row.dependency}: ${row.status}${row.payloads.length === 0 ? '' : ` (${row.payloads.join(', ')})`}`;

type Arguments = ParsedArgs<typeof prepareArgs>;

/** What every verb shares once the host is composed. */
type Session = {
  readonly args: Arguments;
  readonly host: PreparationHost;
  readonly plugins: readonly PreparationPlugin[];
  readonly store: string;
  readonly indicators: HostIndicators | undefined;
  readonly managed: ManagedPreparation;
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
  await writeStdout(
    `${[`profile ${profile.profile}${profile.noFallback ? ' (no fallback)' : ''}, store ${profile.store}`, ...rows].join('\n')}\n`,
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

const prepare = async (session: Session, output: ConsolaInstance): Promise<void> => {
  const { args, host, plugins, store, managed, signal } = session;
  if (args.kernel === undefined) {
    const known = kernelsOf(plugins);
    throw cliError(
      'ARG_KERNEL_MISSING',
      `Name the kernel to prepare (${known.length === 0 ? 'none are installed' : known.join(', ')}), or pass --inspect, --verify or --gc.`,
      exitCodes.usage,
    );
  }
  const { kernel } = args;
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
      offline: args.offline || managed.offline,
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
  const receipts = dependencies.flatMap((dependency) => outcome.receipts[dependency] ?? []);
  const [first] = receipts;
  if (first === undefined) {
    throw new Error(
      `${kernel} is ready but holds no receipt; the store at ${store} is inconsistent. Run tau prepare --verify.`,
    );
  }
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
 * Build `tau prepare` over a roster.
 * @param options - Roster, transport and host path.
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
      const plugins = await (options.plugins ?? installedPlugins)();
      const store = defaultPayloadStore();
      const indicators = detectHostIndicators();
      const host = createPreparationHost({
        plugins,
        store,
        ...(indicators === undefined ? {} : { indicators }),
        ...(options.hostPath === undefined ? {} : { hostPath: options.hostPath }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
        ...(managed.seed === undefined ? {} : { seed: managed.seed }),
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
              : prepare(session, output));
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
 * downloading. Honours `TAU_ACQUISITION`, `TAU_PAYLOAD_MIRROR`, `TAU_PAYLOAD_MIRROR_NO_FALLBACK`, `TAU_PAYLOAD_DIR`,
 * `TAU_PAYLOAD_TARGET`, `TAU_PAYLOAD_EMULATION` and `TAU_CONFIG_DIR`.
 *
 * @example <caption>Prepare, inspect, verify and collect garbage</caption>
 * ```bash
 * tau prepare build123d
 * tau prepare build123d --offline --json
 * tau prepare --inspect --json
 * tau prepare --verify
 * tau prepare --gc --dry-run
 * ```
 */
export const prepareCommand = createPrepareCommand();
