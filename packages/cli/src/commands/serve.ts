import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  defaultConfigDirectory,
  defaultMachineProviders,
  defaultPayloadStore,
  handOffMintPath,
  startHostDaemon,
} from '@taucad/host';
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
import { createConsola } from 'consola';

import { acquisitionOf } from '#acquisition.js';
import type { Acquisition } from '#acquisition.js';
import { prepareServeUi } from '#serve-ui.js';
import type { ServeUi } from '#serve-ui.js';
import { stageUiEnvironment } from '#ui-environment.js';
import { cliZooProxyUrl } from '#zoo-proxy.js';
import { requireGitToolchain } from '#commands/revisions.js';
import { cliError, emit, exitCodes, writeStdout } from '#output.js';
import type { ComputeStoreWorkerData } from '#compute-store.worker.js';
import type * as NativeKernels from '#native-kernels.js';
import type { NativeComposition, NativePreparation } from '#native-kernels.js';

/* Every report goes to stderr: stdout carries only the served URL or its record (`--print`, `--json`). */
const consola = createConsola({
  stdout: process.stderr,
  // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- `isTTY` is `undefined`, not `false`, off a TTY
  formatOptions: { colors: process.stderr.isTTY === true },
});

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
 * @internal
 * @param options - Plugins, config module, Zoo proxy and the acquisition profile.
 * @returns The child's argv.
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

/* An origin as a browser sends it: a scheme, `://` and an authority, nothing after (`app://tau` included). */
const originPattern = /^[a-z][\d+.a-z-]*:\/\/[^\s#/?]+$/u;

/**
 * The browser origins `--allowed-origins` lists (charter S32, ruling X32): exact strings, as a browser sends `Origin`,
 * comma-separated or repeated. A listed origin may read the descriptor across origins and its `/agent` upgrade passes
 * the origin check; admission still needs the token. A wildcard, a path or a trailing slash never matches a browser's
 * `Origin`, so each is refused rather than silently ignored.
 *
 * @internal
 * @param value - The flag's value or values, or `TAU_HOST_ALLOWED_ORIGINS`.
 * @returns The origins, deduplicated, in the order given.
 * @throws {CliError} `ORIGIN_INVALID` (exit 2) for a value that is not an exact origin.
 */
export const parseAllowedOrigins = (value: string | readonly string[] | undefined): readonly string[] => {
  const values = (typeof value === 'string' ? [value] : (value ?? []))
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  for (const origin of values) {
    const special = /^https?:/u.test(origin) && URL.canParse(origin) ? new URL(origin).origin : undefined;
    if (!originPattern.test(origin) || (special !== undefined && special !== origin)) {
      throw cliError(
        'ORIGIN_INVALID',
        `--allowed-origins takes exact origins such as https://tau.new or http://localhost:3000 (no path, no trailing slash, no wildcard); ${JSON.stringify(origin)} is not one.`,
        exitCodes.usage,
      );
    }
  }
  return [...new Set(values)];
};

/** The renderer origin of Tau Desktop (`app://tau`), admitted for a desktop hand-off (X54). */
export const desktopOrigin = 'app://tau';

/** Where a served daemon is handed after it is ready: Tau Desktop, or the Tau UI at a listed website origin. */
export type HandOffTarget =
  | Readonly<{ kind: 'desktop'; origin: string }>
  | Readonly<{ kind: 'website'; origin: string }>;

/**
 * Read `--hand-off`: `desktop`, or one exact website origin serving the Tau UI (the `tau open --ui-origin` escape
 * hatch, charter S32). Either way its origin is admitted, for that hand-off.
 *
 * @internal
 * @param value - The flag's value.
 * @returns The target, or `undefined` when there is no hand-off.
 * @throws {CliError} `ORIGIN_INVALID` (exit 2) for a value that is neither `desktop` nor one exact origin.
 */
export const handOffTarget = (value: unknown): HandOffTarget | undefined => {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  if (value === 'desktop') {
    return { kind: 'desktop', origin: desktopOrigin };
  }
  const origins = parseAllowedOrigins(value);
  if (origins.length !== 1 || !/^https?:\/\//u.test(origins[0]!)) {
    throw cliError(
      'ORIGIN_INVALID',
      `--hand-off takes desktop or one exact http(s) origin serving the Tau UI, such as https://tau.new; ${JSON.stringify(value)} is not one.`,
      exitCodes.usage,
    );
  }
  return { kind: 'website', origin: origins[0]! };
};

/**
 * The link that hands a served daemon to its target with a one-time code (X54). Tau Desktop takes
 * `tau://host/<loopback origin>?code=<code>`; a website takes the same two values in its fragment, which never
 * reaches the website's server.
 *
 * @internal
 * @param target - Where the daemon is handed.
 * @param served - The daemon's served URL.
 * @param code - The one-time code.
 * @returns The link to open.
 */
export const handOffLink = (target: HandOffTarget, served: string, code: string): string => {
  const { origin } = new URL(served);
  if (target.kind === 'desktop') {
    return `tau://host/${origin}?code=${encodeURIComponent(code)}`;
  }
  return `${target.origin}/#${new URLSearchParams({ 'tau-host': origin, 'tau-code': code }).toString()}`;
};

/**
 * Build Launcher 1's configuration from the CLI surface.
 *
 * The admission secret never rides `argv` — it is read from
 * `TAU_HOST_AGENT_TOKEN` or minted here — because `argv` is world-readable in
 * `ps` on every platform this daemon runs on.
 *
 * @param args - Parsed `tau serve` arguments, with the Tau API origin.
 * @param port - The resolved loopback port, or `undefined` to leave the capability off.
 * @returns The agent options, or `undefined` when the capability is off.
 */
const agentOptions = (
  args: {
    readonly ui?: string | undefined;
    readonly workspace?: string;
    readonly gateway?: string;
    readonly model: string;
    readonly modelProvider: string;
    readonly apiUrl: string;
    readonly externalAgents?: boolean;
    readonly testModel?: boolean;
    readonly computeMode: string;
    readonly allowedOrigins?: string | readonly string[];
  },
  port: number | undefined,
): HostDaemonAgentOptions | undefined => {
  const uiRoot = args.ui ? resolve(args.ui) : undefined;
  const allowedOrigins = parseAllowedOrigins(args.allowedOrigins);
  if (port === undefined) {
    return undefined;
  }
  const token = process.env['TAU_HOST_AGENT_TOKEN'] ?? randomBytes(32).toString('base64url');
  if (token.length < 32) {
    throw new TypeError('TAU_HOST_AGENT_TOKEN must contain at least 32 characters');
  }
  const contextWindow = Number(process.env['TAU_HOST_MODEL_CONTEXT_WINDOW'] ?? '200000');
  if (!Number.isSafeInteger(contextWindow) || contextWindow < 1) {
    throw new TypeError('TAU_HOST_MODEL_CONTEXT_WINDOW must be a positive integer');
  }
  /* The same session token `tau publish` and `tau clone` take, for the same
   * reason: a terminal has no cookie jar, and the device credential this daemon
   * paired with authenticates the relay only (C67). */
  const tauApiToken = process.env['TAU_API_TOKEN'];
  return {
    workspaceRoot: agentWorkspaceRoot(args.workspace, process.cwd()),
    tauCloudEnabled: tauCloudEnabled(),
    ...(tauApiToken === undefined || tauApiToken === '' ? {} : { tauApiToken }),
    /* The gateway lives on the Tau API, which is also the relay origin unless
     * the operator points somewhere else (a stub, or a self-hosted API). */
    gatewayBaseUrl: args.gateway ?? args.apiUrl,
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
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
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
 * @internal
 * @param from - Module URL to start from; this module's own by default.
 * @returns The URL `resolveAcpAdapters` resolves from.
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
      /* A runtime child cannot read the store, so a failed handshake is re-verified here (D8, X35). */
      verify: async (runtimePath, signal) => {
        const { verifyStoreClosure } = await nativeKernels();
        return verifyStoreClosure(runtimePath, signal);
      },
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

/** The port `tau serve` asks for first, so a served project keeps one bookmarkable URL (charter Q53). */
export const defaultServePort = 7180;

/** How long `--smoke-test` waits for the served descriptor to answer, in milliseconds. */
const smokeTestTimeout = 30_000;

/** How many ports above the requested one `tau serve` tries before giving up. */
const portSearchSpan = 20;

/**
 * Whether a TCP port is free on the loopback interface the agent channel binds.
 *
 * @internal
 * @param port - The port to try.
 * @param host - The interface; `TAU_HOST_AGENT_BIND` or loopback.
 * @returns `true` when a listener could bind it just now.
 */
export const isPortFree = async (
  port: number,
  host: string = process.env['TAU_HOST_AGENT_BIND'] ?? '127.0.0.1',
): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.listen({ port, host, exclusive: true }, () => {
      probe.close(() => {
        resolve(true);
      });
    });
  });

/**
 * The port `tau serve` listens on: the one asked for (or the stable default) when it is free, otherwise the next free
 * one above it, unless `--strict-port` refuses instead (charter Q53, the Vite and Jupyter idiom).
 *
 * @internal
 * @param options - The `--port` value, whether it is strict, and the probe.
 * @returns The port to bind; `0` asks the OS for an ephemeral one.
 * @throws {CliError} `PORT_IN_USE` (exit 3) when a strict port, or every port in the search span, is taken.
 * @throws {CliError} `PORT_INVALID` (exit 2) for a value that is not a TCP port.
 */
export const resolveServePort = async (options: {
  readonly port: string | number | undefined;
  readonly strict: boolean;
  readonly free?: (port: number) => Promise<boolean>;
}): Promise<number> => {
  const requested =
    options.port === undefined || options.port === '' ? defaultServePort : Number(String(options.port).trim());
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > 65_535) {
    throw cliError('PORT_INVALID', '--port must be a TCP port, or 0 for an ephemeral one', exitCodes.usage);
  }
  if (requested === 0) {
    return 0;
  }
  const free = options.free ?? (async (port: number) => isPortFree(port));
  const last = options.strict ? requested : Math.min(65_535, requested + portSearchSpan);
  for (let port = requested; port <= last; port += 1) {
    // oxlint-disable-next-line no-await-in-loop -- ports are tried in order, the first free one wins.
    if (await free(port)) {
      return port;
    }
  }
  throw cliError(
    'PORT_IN_USE',
    options.strict
      ? `Port ${String(requested)} is in use and --strict-port is set. Stop what holds it, or pass another --port.`
      : `Ports ${String(requested)}–${String(last)} are all in use. Pass --port=<port>, or --port=0 for any free port.`,
    exitCodes.refused,
  );
};

/**
 * Whether `tau serve` opens the browser: as asked, else only for a served UI on an interactive terminal outside CI
 * whose URL is not being printed for a script.
 *
 * @internal
 * @param options - The `--open` flag, the printing flags, and the environment.
 * @returns Whether to open the browser.
 */
export const shouldOpenBrowser = (options: {
  readonly open: boolean | undefined;
  readonly ui: boolean;
  readonly scripted: boolean;
  readonly interactive: boolean;
  readonly ci: boolean;
}): boolean => {
  if (!options.ui) {
    return false;
  }
  if (options.open !== undefined) {
    return options.open;
  }
  return options.interactive && !options.ci && !options.scripted;
};

/**
 * Ask the platform to open a URL in the default browser; a failure is a warning, never fatal.
 *
 * @param url - The URL to open.
 */
const openInBrowser = (url: string): void => {
  const [command, ...prefix] =
    process.platform === 'darwin'
      ? ['open']
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""']
        : ['xdg-open'];
  try {
    const child = spawn(command, [...prefix, url], { detached: true, stdio: 'ignore' });
    child.once('error', (error) => {
      consola.warn(`Could not open a browser (${error.message}). Open ${url} yourself.`);
    });
    child.unref();
  } catch (error) {
    consola.warn(
      `Could not open a browser (${error instanceof Error ? error.message : String(error)}). Open ${url} yourself.`,
    );
  }
};

const parsePositiveInteger = (name: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
};

/**
 * Say where the daemon is serving: the URL once on stdout under `--print` or `--json`, a line on stderr otherwise,
 * and the browser when asked.
 *
 * @param served - The served URL, the workspace, the relay, whether a UI is served, and what to print or open.
 */
const announceServed = async (served: {
  readonly url: string;
  /** The hand-off link, which is printed and opened in place of the URL. */
  readonly handOff?: string | undefined;
  readonly workspace: string;
  readonly relay: string | undefined;
  readonly ui: boolean;
  readonly print: boolean;
  readonly json: boolean;
  readonly open: boolean;
}): Promise<void> => {
  if (served.json) {
    await emit({
      kind: 'serve',
      ok: true,
      url: served.url,
      workspace: served.workspace,
      relay: served.relay ?? null,
      ui: served.ui,
      ...(served.handOff === undefined ? {} : { handOff: served.handOff }),
    });
  } else if (served.print) {
    await writeStdout(`${served.handOff ?? served.url}\n`);
  }
  consola.success(`Serving ${served.workspace} at ${served.url}${served.relay === undefined ? ' (local only)' : ''}`);
  if (served.open) {
    openInBrowser(served.handOff ?? served.url);
  }
};

/**
 * Which UI `tau serve` serves: none (`--no-ui`), a directory (`--ui <dir>`, for development), or by default the
 * digest-pinned Tau UI layer from the payload store (charter W18).
 *
 * @internal
 * @param value - The `--ui` value: a directory, `false` under `--no-ui`, or absent.
 * @returns The choice.
 */
export const serveUiChoice = (
  value: unknown,
): Readonly<{ kind: 'none' }> | Readonly<{ kind: 'store' }> | Readonly<{ kind: 'directory'; directory: string }> => {
  if (value === false || value === 'false') {
    return { kind: 'none' };
  }
  return typeof value === 'string' && value !== '' ? { kind: 'directory', directory: value } : { kind: 'store' };
};

/**
 * Bytes as megabytes with one decimal, for progress lines.
 *
 * @param bytes - A byte count.
 * @returns The count in megabytes, such as `122.0 MB`.
 */
const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * Prepare the pinned Tau UI layer into the payload store, saying what it downloads (I5: automatic, with visible
 * progress). A sealed layer answers at once and says nothing; a download reports every tenth of its bytes on stderr.
 *
 * @param options - Cancellation, and the preparation for tests.
 * @returns The sealed UI directory, or why there is none.
 */
export const prepareStoreUi = async (
  options: { readonly signal?: AbortSignal; readonly prepare?: typeof prepareServeUi } = {},
): Promise<ServeUi> => {
  /* Mutated by the progress callback, so an object: a `let` here narrows to its initial value. */
  const progress = { announced: false, reportedTenth: 0 };
  const ui = await (options.prepare ?? prepareServeUi)({
    signal: options.signal ?? new AbortController().signal,
    onProgress: ({ completedBytes, totalBytes }) => {
      if (!progress.announced) {
        progress.announced = true;
        consola.start(`Downloading the Tau UI (${megabytes(totalBytes)}, once; verified against its pinned digest)`);
      }
      const tenth = totalBytes > 0 ? Math.floor((completedBytes / totalBytes) * 10) : 0;
      if (tenth > progress.reportedTenth) {
        progress.reportedTenth = tenth;
        consola.info(`Tau UI: ${megabytes(completedBytes)} of ${megabytes(totalBytes)} (${String(tenth * 10)}%)`);
      }
    },
  });
  if (ui.status === 'ready' && progress.announced) {
    consola.success('The Tau UI is verified and sealed in the payload store.');
  }
  return ui;
};

/**
 * Mint one hand-off code at the daemon, with the token this process minted for it.
 *
 * @param served - The daemon's served URL.
 * @param token - The daemon's admission token.
 * @returns The code.
 * @throws {CliError} `HAND_OFF_FAILED` (exit 1) when the daemon does not mint one.
 */
const mintHandOffCode = async (served: string, token: string): Promise<string> => {
  try {
    const response = await fetch(new URL(handOffMintPath, served), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(smokeTestTimeout),
    });
    const body = (await response.json()) as { readonly code?: unknown };
    if (!response.ok || typeof body.code !== 'string') {
      throw new Error(`answered ${String(response.status)}`);
    }
    return body.code;
  } catch (error) {
    throw cliError(
      'HAND_OFF_FAILED',
      `The daemon at ${served} did not mint a hand-off code: ${error instanceof Error ? error.message : String(error)}`,
      exitCodes.error,
    );
  }
};

/**
 * `--smoke-test`: the daemon's descriptor must answer, as a page or client would ask it, and so must the UI's document
 * when one is served.
 *
 * @param url - The served origin.
 * @param ui - Whether a UI is served.
 * @throws {CliError} `SMOKE_TEST_FAILED` (exit 1) when it does not answer 200 with a descriptor, or with a document.
 */
const smokeTest = async (url: string, ui: boolean): Promise<void> => {
  const descriptorUrl = new URL('/.well-known/tau-host', url);
  const documentUrl = new URL('/', url);
  let checked = descriptorUrl;
  try {
    const response = await fetch(descriptorUrl, { signal: AbortSignal.timeout(smokeTestTimeout) });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== 'object' || body === null) {
      throw new Error(`answered ${String(response.status)}`);
    }
    if (ui) {
      checked = documentUrl;
      const document = await fetch(documentUrl, { signal: AbortSignal.timeout(smokeTestTimeout) });
      await document.body?.cancel();
      if (!document.ok || !(document.headers.get('content-type') ?? '').includes('text/html')) {
        throw new Error(`answered ${String(document.status)} ${document.headers.get('content-type') ?? ''}`.trim());
      }
    }
  } catch (error) {
    throw cliError(
      'SMOKE_TEST_FAILED',
      `${checked.href} did not answer: ${error instanceof Error ? error.message : String(error)}`,
      exitCodes.error,
    );
  }
  consola.success(`Smoke test passed: ${descriptorUrl.href}${ui ? ` and ${documentUrl.href}` : ''} answer.`);
};

/** `tau serve` command. */
export const serveCommand = defineCommand({
  meta: {
    name: 'serve',
    description: 'Serve a project folder to the browser on this machine; --relay also offers it to Tau Cloud',
  },
  args: {
    dir: {
      type: 'positional',
      description:
        'Project folder to serve (defaults to --workspace, or the current directory when it is a Tau project or outside every Git checkout)',
      required: false,
    },
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
      description:
        'Pair with and serve through this Tau Host relay (e.g. https://api.tau.new); off by default, so the daemon stays local (TAU_HOST_RELAY_URL)',
      required: false,
      default: process.env['TAU_HOST_RELAY_URL'],
    },
    port: {
      type: 'string',
      description: `Loopback port for the page and agent channel; the next free one is used when it is taken (default ${String(defaultServePort)}; 0 for any free port)`,
      required: false,
    },
    strictPort: {
      type: 'boolean',
      description: 'Exit instead of trying the next port when --port is taken',
      default: false,
    },
    open: {
      type: 'boolean',
      description:
        'Open the served UI in the browser; on by default on an interactive terminal outside CI, --no-open never opens',
      required: false,
    },
    print: {
      type: 'boolean',
      description: 'Print the served URL once on stdout (and do not open the browser unless --open)',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Print one versioned JSON record with the served URL on stdout once the daemon is ready',
      default: false,
    },
    smokeTest: {
      type: 'boolean',
      description: 'Start, check that /.well-known/tau-host answers, then stop: exit 0 when it does',
      default: false,
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
      description: 'With --relay: acknowledge that remote project code executes on this machine',
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
      description:
        'Serve the agent channel on exactly this loopback port (0 for an ephemeral one); with --relay, also turns the channel on',
      required: false,
      default: process.env['TAU_HOST_AGENT_PORT'],
    },
    ui: {
      type: 'string',
      description:
        'Directory of a prebuilt Tau UI to serve instead of the digest-pinned one from the payload store (development); --no-ui serves agents only (TAU_HOST_UI_DIR)',
      required: false,
      default: process.env['TAU_HOST_UI_DIR'],
    },
    allowedOrigins: {
      type: 'string',
      description:
        'Browser origins that may read /.well-known/tau-host and open /agent across origins, comma-separated and exact (e.g. https://tau.new); the agent token is still required (TAU_HOST_ALLOWED_ORIGINS)',
      required: false,
      multiple: true,
      default: process.env['TAU_HOST_ALLOWED_ORIGINS'],
    },
    handOff: {
      type: 'string',
      description:
        'Once ready, hand the daemon to Tau Desktop (desktop) or to the Tau UI at one exact origin (e.g. https://tau.new) with a one-time code, admitting that origin',
      required: false,
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
    /* Local-first (charter D29): the relay, pairing and the trust acknowledgement are opt-in together. */
    const relay = args.relay === undefined || args.relay === '' ? undefined : args.relay;
    if (relay !== undefined && !args.trustProjects) {
      throw cliError(
        'TRUST_REQUIRED',
        'tau serve --relay requires --trust-projects: projects the relay offers run their code on this machine.',
        exitCodes.usage,
      );
    }
    /* Before anything is served: this daemon records every turn into a native
     * Git store, so a machine without the binaries is told which one is missing
     * now rather than at the first turn (OQ-B8, S12). Local-first, the daemon
     * already tolerates a missing revision engine per turn, so it warns. */
    try {
      await requireGitToolchain();
    } catch (error) {
      if (relay !== undefined) {
        throw error;
      }
      consola.warn(
        `${error instanceof Error ? error.message : String(error)} Serving without recorded revisions until it is installed.`,
      );
    }
    const maxSessions = parsePositiveInteger('--max-sessions', args.maxSessions);
    if (args.computeMode !== 'off' && args.computeMode !== 'memory' && args.computeMode !== 'durable') {
      throw new TypeError('--compute-mode must be off, memory, or durable');
    }
    const workspace = typeof args.dir === 'string' && args.dir !== '' ? args.dir : args.workspace;
    const handOff = handOffTarget(args.handOff);
    /* `--agentPort` is exact (its old contract); `--port` and the default search upward unless strict. Relayed, the
     * channel stays off unless a port or a UI asks for it, as before. */
    const explicitAgentPort =
      args.agentPort === undefined || args.agentPort === '' ? undefined : String(args.agentPort);
    const wantsChannel =
      relay === undefined ||
      explicitAgentPort !== undefined ||
      (args.port !== undefined && args.port !== '') ||
      Boolean(args.ui) ||
      handOff !== undefined ||
      args.smokeTest ||
      args.print ||
      args.json;
    const port = wantsChannel
      ? explicitAgentPort === undefined
        ? await resolveServePort({ port: args.port, strict: args.strictPort })
        : await resolveServePort({ port: explicitAgentPort, strict: true })
      : undefined;
    const apiUrl = relay ?? process.env['TAU_API_URL'] ?? 'https://api.tau.new';
    /* The UI: a development directory, none, or the pinned layer, prepared into the store on first use (W18). A layer
     * that cannot be prepared leaves agents served and says why; `tau open`, which needs a UI, refuses instead. */
    const uiChoice = serveUiChoice(args.ui);
    let uiDirectory = uiChoice.kind === 'directory' ? uiChoice.directory : undefined;
    if (uiChoice.kind === 'store' && port !== undefined) {
      const storeUi = await prepareStoreUi();
      if (storeUi.status === 'ready') {
        uiDirectory = storeUi.root;
      } else {
        consola.warn(
          `Serving agents without a UI: ${storeUi.message} Pass --ui=<directory of a Tau UI build> to serve one.`,
        );
      }
    }
    /* A hand-off admits its target's origin beside the listed ones (X54). */
    /* `multiple` yields an array at run time though citty types one string. */
    const listedOrigins: unknown = args.allowedOrigins;
    const configured = agentOptions(
      {
        ...args,
        ui: uiDirectory,
        ...(workspace === undefined ? {} : { workspace }),
        apiUrl,
        allowedOrigins: [listedOrigins, handOff?.origin]
          .flat()
          .filter((origin): origin is string => typeof origin === 'string'),
      },
      port,
    );
    if (args.machines && !configured) {
      throw new TypeError('--machines serves beside the agent channel: pass --agentPort or --ui as well');
    }
    const machines = args.machines ? { providers: await defaultMachineProviders() } : undefined;
    /* The served SPA learns the managed profile from the daemon's environment, not its build (W19, X43). */
    const acquisitionValue = process.env['TAU_ACQUISITION'];
    const stagedUi =
      configured?.uiRoot === undefined
        ? undefined
        : await stageUiEnvironment(configured.uiRoot, {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- the client environment key keeps its wire name.
            TAU_ACQUISITION:
              acquisitionValue === undefined || acquisitionValue.trim() === ''
                ? undefined
                : acquisitionOf(acquisitionValue),
          });
    const agent = configured && stagedUi ? { ...configured, uiRoot: stagedUi.root } : configured;
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
      TAU_API_URL: apiUrl,
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End environment variable names. */
    /* The one served URL, printed once on stdout for a script (Q53, C1 R9) and opened for a person. */
    const served = Promise.withResolvers<string>();
    const onEvent = (event: HostDaemonEvent): void => {
      if (event.type === 'agent' && event.state === 'ready' && event.url !== undefined) {
        served.resolve(event.url);
      }
      reportEvent(event);
    };
    const daemon = startHostDaemon({
      relayUrl: new URL(apiUrl),
      relay: relay !== undefined,
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
      zooProxy: { url: zooProxyUrl, apiUrl, sessionToken: process.env['TAU_API_TOKEN'] },
      maxSessions,
      systemSkillBundles,
      pair: args.pair,
      ...(configuredAgent ? { agent: configuredAgent } : {}),
      onEvent,
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
      /* The agent channel names its URL once it listens; a daemon that stops first, or a signal, has nothing to announce. */
      const url =
        configuredAgent === undefined
          ? undefined
          : await Promise.race([
              served.promise,
              daemon.closed.then(
                () => undefined,
                () => undefined,
              ),
              stopped.promise.then(() => undefined),
            ]);
      if (configuredAgent !== undefined && url !== undefined) {
        const scripted = args.print || args.json || args.smokeTest;
        const handOffUrl =
          handOff === undefined
            ? undefined
            : handOffLink(handOff, url, await mintHandOffCode(url, configuredAgent.token));
        await announceServed({
          url,
          handOff: handOffUrl,
          workspace: configuredAgent.workspaceRoot,
          relay,
          ui: configuredAgent.uiRoot !== undefined,
          print: args.print,
          json: args.json,
          /* A hand-off is the point of the run: it opens unless printed for a script or refused with --no-open. */
          open:
            handOffUrl === undefined
              ? shouldOpenBrowser({
                  open: args.open,
                  ui: configuredAgent.uiRoot !== undefined,
                  scripted,
                  interactive: process.stdout.isTTY,
                  ci: Boolean(process.env['CI']),
                })
              : (args.open ?? !scripted),
        });
        if (args.smokeTest) {
          await smokeTest(url, configuredAgent.uiRoot !== undefined);
          return;
        }
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
        await stagedUi?.dispose();
      }
    }
  },
});
