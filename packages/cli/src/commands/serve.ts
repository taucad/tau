import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import { defaultConfigDirectory, defaultMachineProviders, defaultPayloadStore, startHostDaemon } from '@taucad/host';
import { startNativeWorker } from '@taucad/native-process-core';
import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';
import type { ComputeBinding } from '@taucad/runtime/types';
import type {
  HostDaemonAgentOptions,
  HostDaemonEvent,
  HostPrepareKernel,
  RuntimeChildNativeKernels,
} from '@taucad/host';
import { systemSkillBundles } from '@taucad/skills/resources';
import { defineCommand } from 'citty';
import { consola } from 'consola';

import { acquisitionOf } from '#acquisition.js';
import type { Acquisition } from '#acquisition.js';
import { cliZooProxyUrl } from '#zoo-proxy.js';
import { requireGitToolchain } from '#commands/revisions.js';
import { cliError, exitCodes } from '#output.js';
import type { ComputeStoreWorkerData } from '#compute-store.worker.js';
import type * as NativeKernels from '#native-kernels.js';
import type { NativeComposition, NativePreparation } from '#native-kernels.js';

const runtimeChildModulePath = (): string =>
  fileURLToPath(
    new URL(import.meta.url.endsWith('.ts') ? '../host-runtime-child.ts' : './host-runtime-child.mjs', import.meta.url),
  );

const tauCloudEnabled = (): boolean => {
  const value = process.env['TAU_CLOUD_ENABLED'];
  if (value === undefined || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new TypeError('TAU_CLOUD_ENABLED must be exactly true or false');
};

const computeStoreWorkerModulePath = (): string =>
  fileURLToPath(
    new URL(
      import.meta.url.endsWith('.ts') ? '../compute-store.worker.ts' : './compute-store-worker.mjs',
      import.meta.url,
    ),
  );

/**
 * The arguments of one runtime child. The daemon starts it with a minimal environment, so the acquisition profile
 * travels as `--acquisition=locked`.
 * @param options - Plugins, config module, Zoo proxy and the acquisition profile.
 * @returns The child's argv.
 * @internal
 */
export const childArguments = (options: {
  readonly plugin: unknown;
  readonly config?: string;
  readonly zooProxyUrl: string;
  readonly acquisition: Acquisition;
}): string[] => {
  const plugins = Array.isArray(options.plugin)
    ? options.plugin.filter((value): value is string => typeof value === 'string')
    : typeof options.plugin === 'string'
      ? [options.plugin]
      : [];
  return [
    ...plugins.map((plugin) => `--plugin=${plugin}`),
    ...(options.config ? [`--config=${options.config}`] : []),
    `--zoo-proxy-url=${options.zooProxyUrl}`,
    ...(options.acquisition === 'locked' ? ['--acquisition=locked'] : []),
  ];
};

/**
 * Report the agent capability, including what it deliberately withheld.
 *
 * A refused external agent is a *fact about this machine* (adapter missing, CLI
 * not installed), never an error: the daemon keeps serving Tau's own runs.
 *
 * @param event - The daemon's `agent` ready event.
 */
const reportAgentReady = (event: Extract<HostDaemonEvent, { readonly type: 'agent' }>): void => {
  consola.success(`Tau agent channel ready at ${event.url ?? 'unknown'}`);
  const available = (event.externalAgents ?? []).filter((agent) => agent.refusal === undefined);
  if (available.length > 0) {
    consola.success(
      `External agents available: ${available
        .map((agent) => `${agent.displayName}${agent.models.length > 0 ? ` (${agent.models.length} models)` : ''}`)
        .join(', ')}`,
    );
  }
  for (const agent of event.externalAgents ?? []) {
    if (agent.refusal !== undefined) {
      consola.info(`External agent ${agent.displayName} is unavailable (${agent.refusal}).`);
    }
  }
};

const reportEvent = (event: HostDaemonEvent): void => {
  if (event.type === 'pairing') {
    consola.box(`Pair Tau Host\n\nOpen: ${event.verificationUri}\nCode: ${event.userCode}`);
    return;
  }
  if (event.type === 'warning') {
    consola.warn(event.message);
    return;
  }
  if (event.type === 'control' && event.state === 'connected') {
    consola.success('Tau Host connected to the relay');
    return;
  }
  if (event.type === 'control' && event.state === 'disconnected') {
    consola.warn('Tau Host relay disconnected; reconnecting');
    return;
  }
  if (event.type === 'session') {
    consola.info(`Remote session ${event.sessionId}: ${event.state}${event.code ? ` (${event.code})` : ''}`);
    return;
  }
  if (event.type === 'jobs' && event.state === 'ready') {
    consola.success(
      `Tau job worker ${event.runnerId ?? 'unknown'} ready (${String(event.slots ?? 0)} slots, ${String(event.profiles?.length ?? 0)} static profiles)`,
    );
    return;
  }
  if (event.type === 'jobs' && event.state === 'draining') {
    consola.info(`Tau job worker ${event.runnerId ?? 'unknown'} is draining active attempts`);
    return;
  }
  if (event.type === 'agent' && event.state === 'ready') {
    reportAgentReady(event);
  }
};

/**
 * A refused workspace, with the flag that serves another one.
 *
 * @param error - Why the daemon did not start.
 * @returns The same error, or a refusal of the workspace's store that names `--workspace`.
 */
const workspaceRefusal = (error: unknown): unknown =>
  error instanceof Error && Reflect.get(error, 'code') === 'INVALID_REPOSITORY'
    ? cliError('INVALID_REPOSITORY', `${error.message} Pass --workspace=<directory> to serve another directory.`, {
        exit: exitCodes.refused,
      })
    : error;

/**
 * The agent workspace: the one named, or the current directory when it is safe to default to.
 *
 * The workspace is a revision store. Named explicitly, a Git checkout's root is
 * adopted and a directory inside one gets a repository of its own. Defaulted,
 * neither is something the person asked for: `tau serve` started in a checkout
 * by accident recorded revisions onto its branch. So the current directory is
 * used only when it is a Tau project or lies outside every Git checkout.
 *
 * @param workspace - The `--workspace` value or `TAU_HOST_WORKSPACE`, when given.
 * @param cwd - The current directory.
 * @returns The absolute workspace root.
 * @throws {CliError} `WORKSPACE_REQUIRED` when defaulting would adopt or nest inside a Git checkout.
 */
export const agentWorkspaceRoot = (workspace: string | undefined, cwd: string): string => {
  if (workspace !== undefined) {
    return resolve(workspace);
  }
  const root = resolve(cwd);
  if (existsSync(join(root, 'tau.json'))) {
    return root;
  }
  for (let current = root; ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      throw cliError(
        'WORKSPACE_REQUIRED',
        `The current directory is inside the Git checkout at ${current}, so tau serve will not default its workspace to it. Pass --workspace=<directory>: an empty directory for a new project, or this one to record Tau revisions in that repository.`,
        exitCodes.usage,
      );
    }
    if (dirname(current) === current) {
      return root;
    }
  }
};

/**
 * Build Launcher 1's configuration from the CLI surface.
 *
 * The admission secret never rides `argv` — it is read from
 * `TAU_HOST_AGENT_TOKEN` or minted here — because `argv` is world-readable in
 * `ps` on every platform this daemon runs on.
 *
 * @param args - Parsed `tau serve` arguments.
 * @returns The agent options, or `undefined` when the capability is off.
 */
const agentOptions = (args: {
  /* `citty` hands a numeric-looking value back as a number even for a `string`
   * argument, and `--agentPort=0` is the ephemeral-port request — so presence
   * is tested against `undefined`, never for truthiness. */
  readonly agentPort?: string | number;
  readonly ui?: string;
  readonly workspace?: string;
  readonly gateway?: string;
  readonly model: string;
  readonly modelProvider: string;
  readonly relay: string;
  readonly externalAgents?: boolean;
  readonly testModel?: boolean;
  readonly computeMode: string;
}): HostDaemonAgentOptions | undefined => {
  const uiRoot = args.ui ? resolve(args.ui) : undefined;
  const requested = args.agentPort === undefined || args.agentPort === '' ? undefined : Number(args.agentPort);
  if (requested === undefined && !uiRoot) {
    return undefined;
  }
  const port = requested ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError('--agentPort must be a TCP port, or 0 for an ephemeral one');
  }
  const token = process.env['TAU_HOST_AGENT_TOKEN'] ?? randomBytes(32).toString('base64url');
  if (token.length < 32) {
    throw new TypeError('TAU_HOST_AGENT_TOKEN must contain at least 32 characters');
  }
  const contextWindow = Number(process.env['TAU_HOST_MODEL_CONTEXT_WINDOW'] ?? '200000');
  if (!Number.isSafeInteger(contextWindow) || contextWindow < 1) {
    throw new TypeError('TAU_HOST_MODEL_CONTEXT_WINDOW must be a positive integer');
  }
  /* The same session token `tau publish` and `tau open` take, for the same
   * reason: a terminal has no cookie jar, and the device credential this daemon
   * paired with authenticates the relay only (C67). */
  const tauApiToken = process.env['TAU_API_TOKEN'];
  return {
    workspaceRoot: agentWorkspaceRoot(args.workspace, process.cwd()),
    tauCloudEnabled: tauCloudEnabled(),
    ...(tauApiToken === undefined || tauApiToken === '' ? {} : { tauApiToken }),
    /* The gateway lives on the Tau API, which is also the relay origin unless
     * the operator points somewhere else (a stub, or a self-hosted API). */
    gatewayBaseUrl: args.gateway ?? args.relay,
    model: {
      id: args.model,
      contextWindow,
      /* Unvalidated on purpose: the gateway transport owns the wire allowlist
       * and refuses an unsupported provider with a typed
       * `MODEL_PROVIDER_UNSUPPORTED`, which is a better error than a CLI guess. */
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the catalog discriminator is validated at the transport boundary.
      providerKind: args.modelProvider as NonNullable<HostDaemonAgentOptions['model']['providerKind']>,
    },
    systemPrompt:
      process.env['TAU_HOST_SYSTEM_PROMPT'] ??
      'You are Tau, a CAD agent running on the user’s own machine. Work in the project directory you were started in.',
    token,
    port,
    ...(uiRoot ? { uiRoot } : {}),
    /* On by default and self-limiting: an adapter that is not installed, or a
     * CLI that is not on PATH, is simply not advertised. `--no-external-agents`
     * is the operator's off switch, not a prerequisite. Resolution is anchored
     * on the package's own staged adapters, never a PATH lookup (OQ-X1). */
    ...(args.externalAgents === false ? {} : { externalAgents: { resolveFrom: acpAdapterResolveFrom() } }),
    /* On by default, exactly as before, but as this host's own decision: the
     * daemon still offers `test_model` only where the GeoSpec engine resolves,
     * and `--no-test-model` withholds it from one that has it. */
    testModel: args.testModel !== false,
  };
};

/**
 * Where `tau serve` resolves the pinned ACP adapters from.
 *
 * The package build stages them in `dist-acp` beside `dist`, without the vendor
 * binaries their optional dependencies would install, so a published CLI
 * resolves them there. A workspace checkout that has not built falls back to
 * this module, where the adapters are devDependencies.
 *
 * @param from - Module URL to start from; this module's own by default.
 * @returns The URL `resolveAcpAdapters` resolves from.
 * @internal
 */
export const acpAdapterResolveFrom = (from: string = import.meta.url): string => {
  for (let directory = dirname(fileURLToPath(from)); ; directory = dirname(directory)) {
    const staged = join(directory, 'dist-acp', 'package.json');
    if (existsSync(staged)) {
      return pathToFileURL(staged).href;
    }
    /* The package root is the first directory with a manifest; `dist` has none. */
    if (existsSync(join(directory, 'package.json')) || dirname(directory) === directory) {
      return from;
    }
  }
};

/**
 * The native kernels this daemon serves (D37): Build123d for `.py`, PicoGK for `.cs`.
 *
 * Every runtime child composes them from the payload store's receipts, which this process reads and hands over; a
 * kernel that is not prepared answers `KERNEL_NOT_PREPARED`. `prepare_kernel` prepares in this process, with its
 * unrestricted network (D4). The child may not spawn, so this process starts each native worker on its behalf, from
 * a closure sealed in the store and through the OS sandbox (North Star S2). The native packages load on first use.
 *
 * @returns The children's native kernels, the preparation behind `prepare_kernel`, and its disposal.
 */
export const serveNativeKernels = (): {
  readonly native: RuntimeChildNativeKernels;
  readonly prepareKernel: HostPrepareKernel;
  readonly dispose: () => Promise<void>;
} => {
  let loaded: Promise<typeof NativeKernels> | undefined;
  const nativeKernels = async (): Promise<typeof NativeKernels> => {
    loaded ??= import('#native-kernels.js');
    return loaded;
  };
  const compose = async (): Promise<NativeComposition> => {
    try {
      const { composeNativeKernels } = await nativeKernels();
      return await composeNativeKernels();
    } catch (error) {
      consola.warn(`Serving without native kernels: ${error instanceof Error ? error.message : String(error)}`);
      return { unavailable: [] };
    }
  };
  let preparation: Promise<NativePreparation> | undefined;
  const openPreparation = async (): Promise<NativePreparation> => {
    const { openNativePreparation } = await nativeKernels();
    return openNativePreparation();
  };
  return {
    native: {
      /* Beside the payload store and outside TMPDIR, which each runtime child may write. */
      directory: join(dirname(defaultPayloadStore()), 'runtime-children'),
      store: defaultPayloadStore(),
      compose,
      closureRoots: async () => {
        const { closureRoots } = await compose();
        return closureRoots ?? [];
      },
      start: startNativeWorker,
    },
    prepareKernel: async ({ kernel }, { signal, onProgress }) => {
      preparation ??= openPreparation();
      const opened = await preparation;
      return opened.prepare(kernel, { signal, onProgress });
    },
    dispose: async () => {
      if (preparation !== undefined) {
        const opened = await preparation;
        await opened.dispose();
      }
    },
  };
};

const parsePositiveInteger = (name: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
};

/** `tau serve` command. */
export const serveCommand = defineCommand({
  meta: {
    name: 'serve',
    description: 'Run the experimental Tau Host remote-compute daemon',
  },
  args: {
    plugin: {
      type: 'string',
      description: 'Default-invoked plugin package or path installed in the invoking project (repeatable)',
      required: false,
      multiple: true,
    },
    config: {
      type: 'string',
      description: 'Configuration module exporting an invoked "plugins" array',
      required: false,
    },
    relay: {
      type: 'string',
      description: 'Tau Host relay URL',
      default: process.env['TAU_HOST_RELAY_URL'] ?? 'https://api.tau.new',
    },
    maxSessions: {
      type: 'string',
      description: 'Maximum simultaneous runtime sessions',
      default: '1',
    },
    computeMode: {
      type: 'string',
      description: 'Compute reuse mode: off, memory, or durable',
      default: 'durable',
    },
    trustProjects: {
      type: 'boolean',
      description: 'Acknowledge that remote project code executes on this machine',
      default: false,
    },
    pair: {
      type: 'boolean',
      description:
        'Pair interactively when this host has no accepted credential; --no-pair exits instead (a provisioned cloud host)',
      default: true,
    },
    agentPort: {
      type: 'string',
      description: 'Serve the agent channel on this loopback port (0 for an ephemeral one)',
      required: false,
      default: process.env['TAU_HOST_AGENT_PORT'],
    },
    ui: {
      type: 'string',
      description: 'Directory of a prebuilt Tau UI served beside the agent channel, cross-origin isolated',
      required: false,
      default: process.env['TAU_HOST_UI_DIR'],
    },
    workspace: {
      type: 'string',
      description:
        'Workspace root the agent host reads, writes and logs chats under. Defaults to the current directory when it is a Tau project or outside every Git checkout',
      required: false,
      default: process.env['TAU_HOST_WORKSPACE'],
    },
    gateway: {
      type: 'string',
      description: 'Model-gateway base URL; defaults to the relay origin',
      required: false,
      default: process.env['TAU_HOST_GATEWAY_URL'],
    },
    model: {
      type: 'string',
      description: 'Catalog model id from GET /v1/models for agent turns a client does not override',
      default: process.env['TAU_HOST_MODEL'] ?? 'openai-gpt-5.6-luna',
    },
    modelProvider: {
      type: 'string',
      description: 'Provider id of the catalog model id from GET /v1/models (anthropic, openai, vertexai, …)',
      default: process.env['TAU_HOST_MODEL_PROVIDER'] ?? 'openai',
    },
    testModel: {
      type: 'boolean',
      description:
        'Offer the test_model GeoSpec tool where the engine resolves; --no-test-model withholds it (TAU_HOST_TEST_MODEL=false)',
      default: process.env['TAU_HOST_TEST_MODEL'] !== 'false',
    },
    externalAgents: {
      type: 'boolean',
      description:
        'Offer external ACP agents (Claude Code, Codex) that resolve and whose CLI is installed; --no-external-agents withholds them',
      default: process.env['TAU_HOST_EXTERNAL_AGENTS'] !== 'false',
    },
    machines: {
      type: 'boolean',
      description:
        'Serve the machines route beside the agent channel with the Bambu Lab, Grbl and Carvera providers and their simulators (TAU_HOST_MACHINES=true)',
      default: process.env['TAU_HOST_MACHINES'] === 'true',
    },
  },
  async run({ args }) {
    if (args.machines && !/^(1|true)$/iu.test(process.env['TAU_MACHINES_ENABLED'] ?? '')) {
      throw new Error('Machines are not available in this release.');
    }
    if (!args.trustProjects) {
      throw new Error(
        'tau serve is experimental and requires --trust-projects. Remote project code executes on this machine.',
      );
    }
    /* Before anything is served: this daemon records every turn into a native
     * Git store, so a machine without the binaries is told which one is missing
     * now rather than at the first turn (OQ-B8, S12). */
    await requireGitToolchain();
    const maxSessions = parsePositiveInteger('--max-sessions', args.maxSessions);
    if (args.computeMode !== 'off' && args.computeMode !== 'memory' && args.computeMode !== 'durable') {
      throw new TypeError('--compute-mode must be off, memory, or durable');
    }
    const agent = agentOptions(args);
    if (args.machines && !agent) {
      throw new TypeError('--machines serves beside the agent channel: pass --agentPort or --ui as well');
    }
    const machines = args.machines ? { providers: await defaultMachineProviders() } : undefined;
    let computeWorker: Worker | undefined;
    let computeConnection: ReturnType<typeof connectSqliteComputeStoreWorker> | undefined;
    const computeWorkspaceRoot = agent?.workspaceRoot;
    const invalidateComputeWorker = (worker: Worker): void => {
      if (computeWorker !== worker) {
        return;
      }
      computeConnection?.dispose();
      computeConnection = undefined;
      computeWorker = undefined;
    };
    const ensureCompute = (): ReturnType<typeof connectSqliteComputeStoreWorker> => {
      if (computeConnection) {
        return computeConnection;
      }
      if (!computeWorkspaceRoot) {
        throw new Error('Durable compute requires an admitted workspace.');
      }
      const worker = new Worker(computeStoreWorkerModulePath(), {
        workerData: { directory: join(defaultConfigDirectory(), 'compute') } satisfies ComputeStoreWorkerData,
      });
      worker.once('exit', () => {
        invalidateComputeWorker(worker);
      });
      worker.on('error', (error) => {
        invalidateComputeWorker(worker);
        consola.error(`Compute store worker failed: ${error.message.replaceAll(/\s+/gu, ' ')}`);
      });
      computeWorker = worker;
      computeConnection = connectSqliteComputeStoreWorker({ worker, workspace: computeWorkspaceRoot });
      return computeConnection;
    };
    const compute: ComputeBinding | (() => ComputeBinding) | undefined = agent
      ? args.computeMode === 'durable'
        ? () => ({ mode: 'durable', store: ensureCompute().store })
        : { mode: args.computeMode }
      : undefined;
    const kernels = serveNativeKernels();
    const configuredAgent = agent
      ? {
          ...agent,
          prepareKernel: kernels.prepareKernel,
          ...(machines ? { machines } : {}),
          compute: compute!,
          ...(args.computeMode === 'durable'
            ? {
                computeControl: {
                  inspect: async (input: { signal?: AbortSignal }) => ensureCompute().control.inspect(input),
                  clear: async (input: { signal?: AbortSignal }) => ensureCompute().control.clear(input),
                  collect: async (input: { budget: number; cursor?: string; signal?: AbortSignal }) =>
                    ensureCompute().control.collect(input),
                },
              }
            : {}),
        }
      : undefined;
    const stopped = Promise.withResolvers<NodeJS.Signals>();
    const onSignal = (signal: NodeJS.Signals): void => {
      stopped.resolve(signal);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    /* The relay is this daemon's Tau API, so its Zoo proxy is too unless TAU_WEBSOCKET_URL says otherwise. */
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
    const zooProxyUrl = cliZooProxyUrl({
      TAU_WEBSOCKET_URL: process.env['TAU_WEBSOCKET_URL'],
      TAU_API_URL: args.relay,
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End environment variable names. */
    const daemon = startHostDaemon({
      relayUrl: new URL(args.relay),
      runtimeHost: {
        modulePath: runtimeChildModulePath(),
        args: childArguments({
          plugin: args.plugin,
          config: args.config,
          zooProxyUrl,
          acquisition: acquisitionOf(process.env['TAU_ACQUISITION']),
        }),
        native: kernels.native,
      },
      zooProxy: { url: zooProxyUrl, apiUrl: args.relay, sessionToken: process.env['TAU_API_TOKEN'] },
      maxSessions,
      systemSkillBundles,
      pair: args.pair,
      ...(configuredAgent ? { agent: configuredAgent } : {}),
      onEvent: reportEvent,
    });
    try {
      /* A signal before the daemon is ready stops it too: opening the workspace's
       * store can take a while, and Ctrl+C must not wait for it. */
      const started = await Promise.race([
        daemon.ready.then(
          (): 'ready' => 'ready',
          (error: unknown) => {
            throw workspaceRefusal(error);
          },
        ),
        stopped.promise.then((): 'signal' => 'signal'),
      ]);
      if (started === 'signal') {
        return;
      }
      const signalOutcome = async (): Promise<{ readonly type: 'signal' }> => {
        await stopped.promise;
        return { type: 'signal' };
      };
      const daemonOutcome = async (): Promise<{
        readonly type: 'closed';
        readonly result: Awaited<typeof daemon.closed>;
      }> => {
        const result = await daemon.closed;
        return { type: 'closed', result };
      };
      const outcome = await Promise.race([signalOutcome(), daemonOutcome()]);
      if (outcome.type === 'closed' && outcome.result.cause === 'fatal') {
        throw outcome.result.error;
      }
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      try {
        await daemon.close();
      } catch (error) {
        /* The last thing a stopping daemon does is record what this project
         * changed, and a store that refuses that revision keeps the project
         * rather than losing it (C70). Say which refusal it was and that
         * stopping again re-attempts it, instead of ending on an unmapped store
         * exception — reported rather than thrown, because a throw from this
         * `finally` would replace whatever brought the daemon down. */
        consola.error(
          `Tau Host could not record this project’s last revision: ${error instanceof Error ? error.message : String(error)} Nothing was lost — run tau serve again to retry it.`,
        );
        process.exitCode = exitCodes.error;
      } finally {
        computeConnection?.dispose();
        await computeWorker?.terminate();
        await kernels.dispose().catch(() => undefined);
      }
    }
  },
});
