/**
 * The CLI's side of native kernels. A native kernel is whatever the runtime definition lists (built-ins plus
 * `--plugin`/`--config`): each kernel binds to its sealed closure itself, in `initialize`, and refuses with
 * `KERNEL_NOT_PREPARED` until it is prepared. This module learns which native deployments a runtime lists from a
 * thread that builds it (no kernel code loads in the command's process), prepares them through the payload store, and
 * maps refusals to CLI errors and exit codes.
 *
 * @module
 */
import { Worker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';

import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';
import {
  defaultPayloadStore,
  inspectNativeKernels,
  loadReportedDeployments,
  nativeDeploymentReportSchema,
  openNativePreparation as openStorePreparation,
  preparableKernels,
  preparationPluginsOf,
  UnknownNativeKernelError,
  verifyStoreClosure as storeClosureVerifier,
} from '@taucad/native-process-core/store';
import type {
  NativeClosureAnswer,
  NativeDeploymentReport,
  NativePreparation,
  NativeStoreInput,
} from '@taucad/native-process-core/store';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { parsePluginDeployment, readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { ManagedPreparation, PreparationPlugin } from '@taucad/runtime/preparation/node';
import { z } from 'zod';

import { cliError, exitCodes } from '#output.js';
import type { RuntimeWorkerData } from '#runtime.worker.js';

/**
 * D8: a native worker that exits before its handshake re-verifies its closure against the receipt beside it, so the
 * refusal names the damaged file and the `tau prepare` call that repairs it.
 */
export const verifyStoreClosure = storeClosureVerifier((files) =>
  files === undefined ? 'Run `tau prepare` for the kernel to rebuild it.' : 'Run `tau prepare --verify` to repair it.',
);

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

const storeInput = (): NativeStoreInput => ({ store: defaultPayloadStore(), managed: readManaged() });

/** What a runtime thread in `describe` mode posts its parent. */
const describedSchema = z.object({
  type: z.literal('described'),
  report: nativeDeploymentReportSchema,
  plugins: z.array(z.string()),
});

/** What a runtime definition lists, as a thread that built it reported it. */
export type DescribedRuntime = {
  /** The native deployments it lists, in list order. */
  readonly report: NativeDeploymentReport;
  /** The `meta.name` of every plugin it lists, in list order. */
  readonly plugins: readonly string[];
};

/** Milliseconds a describing thread may take to build the runtime. */
const describeTimeout = 120_000;

/**
 * Build the CLI runtime in a thread of its own and report what it lists, so the native deployments it carries can be
 * prepared without loading any kernel module in this process.
 * @param input - The runtime's inputs, as the runtime worker takes them, and the thread's environment and Node flags.
 * @returns What the runtime lists.
 * @throws {Error} When the runtime cannot be built (an unloadable `--plugin` or `--config`).
 */
export const describeRuntime = async (
  input: Omit<RuntimeWorkerData, 'describe'> & Pick<WorkerOptions, 'env' | 'execArgv'>,
): Promise<DescribedRuntime> => {
  const { env, execArgv, ...workerData } = input;
  const worker = new Worker(
    new URL(import.meta.url.endsWith('.ts') ? './runtime.worker.ts' : './runtime-worker.mjs', import.meta.url),
    {
      workerData: { ...workerData, describe: true } satisfies RuntimeWorkerData,
      ...(env === undefined ? {} : { env }),
      ...(execArgv === undefined ? {} : { execArgv }),
    },
  );
  try {
    const described = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`The runtime did not report its kernels within ${String(describeTimeout / 1000)} s.`));
      }, describeTimeout);
      timer.unref();
      worker.once('message', (message: unknown) => {
        clearTimeout(timer);
        resolve(message);
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`The runtime thread exited with code ${String(code)} before it reported its kernels.`));
      });
    });
    const { report, plugins } = describedSchema.parse(described);
    return { report, plugins };
  } finally {
    await worker.terminate();
  }
};

/**
 * Every kernel a report's deployments declare, with the extensions it handles, read from the manifests alone.
 * @param report - The report.
 * @returns One row per declared kernel, in report then manifest order.
 */
export const preparableKernelsOf = (
  report: NativeDeploymentReport,
): ReadonlyArray<{ readonly kernel: string; readonly extensions: readonly string[] }> =>
  report.flatMap((row) =>
    Object.entries(parsePluginDeployment(row.manifest, `${row.package} tau-plugin.json`).kernels).map(
      ([kernel, { extensions }]) => ({ kernel, extensions }),
    ),
  );

/**
 * The preparation plugins of a report's deployments, with their seal steps and package roots: each light deployment
 * module is imported by the file URL the thread resolved, never kernel code.
 * @param report - The report.
 * @returns One preparation plugin per deployment, in report order.
 */
export const preparationPluginsFor = async (report: NativeDeploymentReport): Promise<readonly PreparationPlugin[]> =>
  preparationPluginsOf(await loadReportedDeployments(report));

/**
 * The deployments a report lists: each light deployment module, imported by the file URL the thread resolved, never
 * kernel code.
 * @param report - The report.
 * @returns One deployment per row, in report order.
 */
export const reportedDeployments = async (report: NativeDeploymentReport): Promise<readonly NativeKernelDeployment[]> =>
  loadReportedDeployments(report);

/**
 * Open the preparation host `tau mcp` and `tau serve` prepare through: the deployments with their seal steps, the
 * shared store and the managed profile, with the process's unrestricted `fetch` (D4).
 * @param options - The deployments, read when the first kernel is prepared, and the transport, for tests.
 * @returns The preparation and its disposal; preparing a kernel no deployment declares throws `UNKNOWN_KERNEL` (exit 2).
 */
export const openNativePreparation = (options: {
  readonly deployments: () => Promise<readonly NativeKernelDeployment[]>;
  readonly fetch?: typeof fetch;
}): NativePreparation => {
  let opened: Promise<NativePreparation> | undefined;
  const open = async (): Promise<NativePreparation> =>
    openStorePreparation({
      ...storeInput(),
      deployments: await options.deployments(),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  return {
    prepare: async (kernel, context) => {
      opened ??= open();
      const preparation = await opened;
      try {
        return await preparation.prepare(kernel, context);
      } catch (error) {
        if (error instanceof UnknownNativeKernelError) {
          throw cliError(error.code, error.message, exitCodes.usage);
        }
        throw error;
      }
    },
    dispose: async () => {
      if (opened !== undefined) {
        const preparation = await opened;
        await preparation.dispose();
      }
    },
  };
};

/**
 * The CLI error for a kernel that refused as not prepared or as unable to run here, as `tau export` reports it.
 * @param issues - The operation's issues.
 * @returns The error, or `undefined` when no native kernel refused.
 */
export const unpreparedKernelError = (issues: readonly KernelIssue[]): Error | undefined => {
  for (const issue of issues) {
    const details = issue.details as Readonly<Record<string, unknown>> | undefined;
    const kernel = typeof details?.['kernel'] === 'string' ? details['kernel'] : undefined;
    if (kernel !== undefined && issue.code === 'KERNEL_NOT_PREPARED') {
      return cliError(
        'KERNEL_NOT_PREPARED',
        `The ${kernel} kernel is not prepared on this machine. Run \`tau prepare ${kernel}\` once, then export again.`,
        exitCodes.refused,
      );
    }
    if (
      kernel !== undefined &&
      issue.code === 'KERNEL_CAPABILITY_MISSING' &&
      details?.['reason'] === 'unsupported-target'
    ) {
      return cliError('UNSUPPORTED_TARGET', issue.message, exitCodes.refused);
    }
  }
  return undefined;
};

/**
 * The deployment module this CLI itself resolves for a package.
 * @param packageName - The npm package.
 * @returns Its URL, or `undefined` when this CLI ships no such package.
 */
const shippedEntry = (packageName: string): string | undefined => {
  try {
    return import.meta.resolve(`${packageName}/native`);
  } catch {
    return undefined;
  }
};

const shipped = new Map<string, Promise<NativeKernelDeployment | undefined>>();

/**
 * The deployment of a native kernel package this CLI ships, imported from its own install.
 * @param packageName - The npm package.
 * @returns The deployment, or `undefined` when this CLI ships no such package.
 */
const shippedDeployment = async (packageName: string): Promise<NativeKernelDeployment | undefined> => {
  let deployment = shipped.get(packageName);
  if (deployment === undefined) {
    const entry = shippedEntry(packageName);
    deployment = (async () => {
      if (entry === undefined) {
        return undefined;
      }
      try {
        const [loaded] = await loadReportedDeployments([
          { package: packageName, entry, packageRoot: entry, manifest: {}, kernels: [] },
        ]);
        return loaded;
      } catch {
        return undefined;
      }
    })();
    shipped.set(packageName, deployment);
  }
  return deployment;
};

/** One kernel's closure request from a runtime child, as `RuntimeChildClosureRequest` carries it. */
export type ReportedClosureRequest = {
  readonly package: string;
  readonly kernel: string;
  readonly manifest: unknown;
  readonly packageRoot: string;
};

/**
 * Answer a runtime child's closure request from the CLI's payload store, from the data it sent alone: its package's
 * unparsed `tau-plugin.json` and root. No module the child names is imported, and nothing is downloaded.
 * @param request - The child's request.
 * @returns The answer the child's kernel binds with, and the roots of the closures it names as sealed.
 */
export const inspectReportedClosure = async (
  request: ReportedClosureRequest,
): Promise<{ readonly answer: NativeClosureAnswer; readonly roots: readonly string[] }> => {
  /* A package this CLI ships is read as this CLI prepares it, from its own deployment, whatever the child sent; any
   * other from the child's data. Reading a launch index uses only the manifest and the package root: the seal step and
   * the launch set run when a closure is prepared, which never happens from a child's data. */
  const deployment: NativeKernelDeployment = (await shippedDeployment(request.package)) ?? {
    package: request.package,
    ecosystem: 'none',
    manifest: request.manifest,
    packageRoot: request.packageRoot,
    entry: request.packageRoot,
    optionsSchema: z.record(z.string(), z.unknown()),
    optionsFromClosure: () => ({}),
    launchSet: () => [],
  };
  const inspection = await inspectNativeKernels({ ...storeInput(), deployments: [deployment] });
  const answer: NativeClosureAnswer = inspection.find(({ kernel }) => kernel === request.kernel)?.answer ?? {
    status: 'unavailable',
    reason: 'not-prepared',
    byteLength: 0,
  };
  return { answer, roots: answer.status === 'ready' ? Object.values(answer.closures).map(({ root }) => root) : [] };
};

/**
 * This CLI's own deployments of the packages a report lists: the native kernels it ships. A daemon prepares only
 * those, from its own install, since a runtime child runs project code and may report any file.
 * @param report - A runtime child's report.
 * @returns The deployments this CLI ships, in report order.
 */
export const shippedDeploymentsOf = async (report: NativeDeploymentReport): Promise<NativeKernelDeployment[]> => {
  const deployments = await Promise.all(report.map(async (row) => shippedDeployment(row.package)));
  return deployments.filter((deployment): deployment is NativeKernelDeployment => deployment !== undefined);
};

/**
 * The kernels of a report this CLI ships, which a daemon prepares.
 * @param report - A runtime child's report.
 * @returns Their ids.
 */
export const shippedKernelsOf = async (report: NativeDeploymentReport): Promise<ReadonlySet<string>> =>
  new Set(preparableKernels(await shippedDeploymentsOf(report)).map(({ kernel }) => kernel));
