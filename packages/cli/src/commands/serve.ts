import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import { createSolverHatchetJobWorkerFactory, defaultConfigDirectory, startHostDaemon } from '@taucad/host';
import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';
import type { ComputeBinding } from '@taucad/runtime/types';
import type { HostDaemonAgentOptions, HostDaemonEvent } from '@taucad/host';
import { calculixSolverVersion, createDirectorySolverInputMaterializer } from '@taucad/jobs-solvers';
import type { OpenFoamSolverVersion } from '@taucad/jobs-solvers';
import { defineCommand } from 'citty';
import { consola } from 'consola';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { requireGitToolchain } from '#commands/revisions.js';

const runtimeChildModulePath = (): string =>
  fileURLToPath(
    new URL(import.meta.url.endsWith('.ts') ? '../host-runtime-child.ts' : './host-runtime-child.mjs', import.meta.url),
  );

const computeStoreWorkerModulePath = (): string =>
  fileURLToPath(
    new URL(
      import.meta.url.endsWith('.ts') ? '../compute-store.worker.ts' : './compute-store-worker.mjs',
      import.meta.url,
    ),
  );

const childArguments = (options: { readonly plugin: unknown; readonly config?: string }): string[] => {
  const plugins = Array.isArray(options.plugin)
    ? options.plugin.filter((value): value is string => typeof value === 'string')
    : typeof options.plugin === 'string'
      ? [options.plugin]
      : [];
  return [...plugins.map((plugin) => `--plugin=${plugin}`), ...(options.config ? [`--config=${options.config}`] : [])];
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
  return {
    workspaceRoot: resolve(args.workspace ?? process.cwd()),
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
     * on *this* module because the adapters are the distributed daemon's own
     * dependencies, never a PATH lookup (OQ-X1). */
    ...(args.externalAgents === false ? {} : { externalAgents: { resolveFrom: import.meta.url } }),
    /* On by default, exactly as before, but as this host's own decision: the
     * daemon still offers `test_model` only where the GeoSpec engine resolves,
     * and `--no-test-model` withholds it from one that has it. */
    testModel: args.testModel !== false,
  };
};

const parsePositiveInteger = (name: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
};

const parseAttempts = (value: string): readonly number[] => {
  const attempts = value.split(',').map((entry) => parsePositiveInteger('--job-max-attempts', entry));
  return [...new Set(attempts)].toSorted((left, right) => left - right);
};

const parseOpenFoamVersion = (value: string): OpenFoamSolverVersion => {
  if (value !== '2506' && value !== '2606') {
    throw new TypeError('--openfoam-version must be 2506 or 2606');
  }
  return value;
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
    jobSlots: {
      type: 'string',
      description: 'Hatchet slots advertised by this daemon when HATCHET_CLIENT_TOKEN is configured',
      default: String(availableParallelism()),
    },
    jobMaxAttempts: {
      type: 'string',
      description: 'Comma-separated retry counts for which static Hatchet task profiles are installed',
      default: '1',
    },
    solverInputRoot: {
      type: 'string',
      description: 'Deployment-owned directory CAS root containing one extracted directory per SHA-256 digest',
      required: false,
      default: process.env['TAU_SOLVER_INPUT_ROOT'],
    },
    openfoamVersion: {
      type: 'string',
      description: 'Exact OpenFOAM release advertised by this worker',
      default: process.env['TAU_OPENFOAM_VERSION'] ?? '2506',
    },
    openfoamImage: {
      type: 'string',
      description: 'Optional reviewed immutable OpenFOAM image override',
      required: false,
      default: process.env['TAU_OPENFOAM_IMAGE'],
    },
    calculixImage: {
      type: 'string',
      description: 'Optional reviewed immutable CalculiX 2.23 image',
      required: false,
      default: process.env['TAU_CALCULIX_IMAGE'],
    },
    trustProjects: {
      type: 'boolean',
      description: 'Acknowledge that remote project code executes on this machine',
      default: false,
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
      description: 'Workspace root the agent host reads, writes and logs chats under',
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
  },
  async run({ args }) {
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
        workerData: { directory: join(defaultConfigDirectory(), 'compute') },
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
    const configuredAgent = agent
      ? {
          ...agent,
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
    const hatchetToken = process.env['HATCHET_CLIENT_TOKEN'];
    const jobWorker = (() => {
      if (!hatchetToken) {
        consola.warn('Durable job execution is disabled because HATCHET_CLIENT_TOKEN is not configured');
        return undefined;
      }
      if (!args.solverInputRoot) {
        throw new TypeError('--solver-input-root is required when HATCHET_CLIENT_TOKEN enables solver jobs');
      }
      const inputRoot = resolve(args.solverInputRoot);
      const openFoamVersion = parseOpenFoamVersion(args.openfoamVersion);
      return createSolverHatchetJobWorkerFactory({
        hatchetToken,
        hatchetNamespace: process.env['HATCHET_CLIENT_NAMESPACE'] ?? 'tau-local',
        slots: parsePositiveInteger('--job-slots', args.jobSlots),
        supportedMaxAttempts: parseAttempts(args.jobMaxAttempts),
        openFoamSolverVersion: openFoamVersion,
        ...(args.openfoamImage ? { openFoamImage: args.openfoamImage } : {}),
        ...(args.calculixImage
          ? {
              calculixImage: {
                reference: args.calculixImage,
                solverVersion: calculixSolverVersion,
              },
            }
          : {}),
        inputMaterializer: createDirectorySolverInputMaterializer({
          resolve: async (snapshot) => join(inputRoot, snapshot.digest.slice('sha256:'.length)),
        }),
      });
    })();
    const stopped = Promise.withResolvers<NodeJS.Signals>();
    const onSignal = (signal: NodeJS.Signals): void => {
      stopped.resolve(signal);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    const daemon = startHostDaemon({
      relayUrl: new URL(args.relay),
      runtimeHost: {
        modulePath: runtimeChildModulePath(),
        args: childArguments({ plugin: args.plugin, config: args.config }),
      },
      maxSessions,
      ...(jobWorker ? { jobWorker } : {}),
      ...(configuredAgent ? { agent: configuredAgent } : {}),
      onEvent: reportEvent,
    });
    try {
      await daemon.ready;
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
      } finally {
        computeConnection?.dispose();
        await computeWorker?.terminate();
      }
    }
  },
});
