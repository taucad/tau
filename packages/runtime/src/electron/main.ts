/**
 * Electron main-process helpers for Tau runtime utility-process hosts.
 *
 * @public
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import type {
  ForkOptions,
  IpcMain,
  IpcMainEvent,
  MessagePortMain,
  Session,
  UtilityProcess,
  WebRequestFilter,
} from 'electron';
import { ipcMain as defaultIpcMain, MessageChannelMain, session as defaultSession, utilityProcess } from 'electron';

import { electronRuntimeChannel as runtimeChannel } from '#electron/constants.js';
import { documentHeaders } from '#cross-origin-isolation/index.js';
import { wrapMessagePortMain } from '@taucad/rpc';
import { _resolveComputeStore } from '#cache/kernel-compute-runtime.js';
import { exposeComputeStoreChannel } from '#transport/_internal/compute-store-channel.js';
import type { ComputeBinding } from '#types/runtime-compute.types.js';

/**
 * Default IPC channel used by Tau's Electron runtime bridge.
 *
 * @public
 */
export const electronRuntimeChannel = runtimeChannel;

/**
 * Options for {@link installElectronRuntimeHeaders}.
 *
 * @public
 */
export type ElectronRuntimeHeadersOptions = {
  /** Electron session whose responses receive COOP and COEP headers. */
  readonly session?: Session;
};

/**
 * Application-owned resolution of one utility fork from a renderer-supplied context.
 *
 * The runtime carries the plumbing only: it sanitizes the context, calls this
 * resolver, and validates the returned environment against
 * {@link RegisterElectronRuntimeMainOptions.forkEnvAllowlist}. Which project
 * root, definition, or entry a context maps to is the application's business.
 * Throwing refuses the request — no utility is forked.
 *
 * @public
 */
export type ElectronRuntimeForkResolver = (context: Record<string, string>) => {
  /** Host-minted compute authority for this admitted fork. */
  readonly compute?: ComputeBinding;
  /** Application-minted rooted filesystem capability for this admitted fork. */
  readonly fileSystemPort?: MessagePortMain;
  /**
   * Environment merged over `env`; every key must be in the allowlist.
   * A plain string record, not `NodeJS.ProcessEnv`: a resolver returns the two
   * or three names it computed, and ambient augmentations of `ProcessEnv`
   * (Next's required `NODE_ENV`, for one) would reject exactly that.
   */
  readonly env?: Readonly<Record<string, string>>;
  /** Utility entry for this request. Defaults to the statically configured one. */
  readonly utilityEntry?: string | URL;
};

/**
 * One utility exit as the main process observed it.
 *
 * `released` is true exactly when main itself initiated the kill — a renderer
 * release, a destroyed or gone sender, or broker disposal — so a supervised
 * shutdown is never reported as an unexplained death. `stderrTail` is the last
 * few kilobytes the utility wrote to stderr, present only when it wrote any;
 * for a utility that dies before its first message that tail is the only
 * record of why.
 *
 * @public
 */
export type ElectronRuntimeHostExit = {
  /** Process exit code Electron reported. */
  readonly exitCode: number;
  /** Whether main initiated the kill. */
  readonly released: boolean;
  /** Last stderr the utility wrote, bounded and omitted when empty. */
  readonly stderrTail?: string;
};

/**
 * An {@link ElectronRuntimeHostExit} attributed to the utility that produced it.
 *
 * @public
 */
export type ElectronRuntimeUtilityExit = ElectronRuntimeHostExit & {
  /** Broker-assigned identity of the utility that exited. */
  readonly hostId: string;
};

/**
 * Options for {@link registerElectronRuntimeMain}.
 *
 * @public
 */
export type RegisterElectronRuntimeMainOptions = {
  /** Host-owned compute binding transferred privately to each utility. */
  readonly compute?: ComputeBinding;
  /** IPC channel shared with preload. Defaults to {@link electronRuntimeChannel}. */
  readonly channel?: string;
  /** Environment passed to each spawned utility process. */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Environment names {@link RegisterElectronRuntimeMainOptions.resolveFork}
   * may return. Empty by default: an application names every key a resolver is
   * allowed to set, so a resolver bug cannot reach `ELECTRON_RUN_AS_NODE` or
   * `NODE_OPTIONS`. Static `env` is not filtered — it is the application's own.
   */
  readonly forkEnvAllowlist?: readonly string[];
  /**
   * Executable arguments for each spawned utility process — canonically
   * `['--max-old-space-size=8192']` to raise the utility's V8 heap for large
   * assemblies. Omitted entirely when unset, so Electron's default applies.
   *
   * Caveat: Electron documents `execArgv` only as "arguments passed to the
   * executable" and says nothing about V8 flags. The utility process is a Node
   * environment that parses them, but that is unverified here; if a flag does
   * not take effect, pass it as `NODE_OPTIONS` through `env` instead.
   */
  readonly execArgv?: readonly string[];
  /**
   * Most utility processes this broker may hold at once, spare included.
   * The (N+1)th request is refused with an {@link ElectronRuntimeUtilityLimitError}
   * rather than left to the operating system's memory pressure.
   */
  readonly maxUtilities?: number;
  /**
   * Electron IPC main implementation, primarily for alternate hosts and tests.
   * Also the admission seam: a view that filters before delegating to the real
   * `ipcMain` gates which frames may fork a utility.
   */
  // ponytail: admission rides the existing ipcMain injection point; add a predicate the day the desktop spike proves the wrapper awkward.
  readonly ipcMain?: IpcMain;
  /** Receives utility-spawn, relay, and fork-refusal failures. */
  readonly onError?: (error: Error) => void;
  /** Receives every utility exit, whether main released it or the process died on its own. */
  readonly onUtilityExit?: (exit: ElectronRuntimeUtilityExit) => void;
  /** Receives every fork, with the entry that was actually forked for it. */
  readonly onUtilityFork?: (fork: { readonly hostId: string; readonly entry: string }) => void;
  /** Receives every stderr chunk a utility writes, as it is written. */
  readonly onUtilityStderr?: (output: { readonly hostId: string; readonly chunk: string }) => void;
  /**
   * Per-request fork resolution from the renderer's sanitized context. Omitted
   * entirely, every request forks `utilityEntry` with the static `env`.
   */
  readonly resolveFork?: ElectronRuntimeForkResolver;
  /** Operating-system service name assigned to the utility process. */
  readonly serviceName?: string;
  /**
   * Utility-process standard I/O routing. Defaults to `'pipe'` so the broker
   * reads each utility's stderr; an inherited stream goes nowhere in a packaged
   * app and takes every boot stack with it.
   */
  readonly stdio?: ForkOptions['stdio'];
  /** Built utility-process module that calls `serveElectronRuntime`. */
  readonly utilityEntry: string | URL;
};

/**
 * Disposable main-process runtime broker registration.
 *
 * @public
 */
export type ElectronRuntimeMainHandle = {
  /**
   * Mint one runtime port for a trusted main-process caller.
   *
   * Unlike the IPC listener, this input is application-owned rather than
   * renderer-supplied. It still passes through the same resolver validation,
   * fork and lease path so the two clients cannot drift.
   */
  connect(input: ElectronRuntimeMainConnectInput): ElectronRuntimeMainConnection;
  /** Unregister IPC listeners and terminate every utility host owned by this broker. */
  dispose(): void;
  /**
   * Fork the idle spare for the statically configured entry and environment,
   * so the first request that resolves to them is served by a process that is
   * already past its module graph. A no-op once a spare exists or the cap is
   * reached; a request whose resolved environment differs forks its own.
   */
  prewarm(): void;
};

/**
 * Refusal raised when a fork would exceed
 * {@link RegisterElectronRuntimeMainOptions.maxUtilities}.
 *
 * @public
 */
export class ElectronRuntimeUtilityLimitError extends Error {
  /**
   * Name the cap in the message: a refusal that does not say what was reached
   * reads like a crash.
   *
   * @param limit - The cap that was reached.
   */
  public constructor(limit: number) {
    super(`registerElectronRuntimeMain: refusing to exceed ${limit} utility processes`);
    this.name = 'ElectronRuntimeUtilityLimitError';
  }
}

/** A main-owned request for one isolated runtime utility. @public */
export type ElectronRuntimeMainConnectInput = {
  /** Names this privileged path explicitly at the process-spawning boundary. */
  readonly purpose: 'main-process-client';
  /** Application-admitted fork context. */
  readonly context?: Readonly<Record<string, string>>;
};

/** One main-owned runtime utility lease. @public */
export type ElectronRuntimeMainConnection = {
  /** Client leg of the runtime channel, suitable for transfer to another utility. */
  readonly port: MessagePortMain;
  /** Settles only when the operating-system utility process exits, with what main observed. */
  readonly closed: Promise<ElectronRuntimeHostExit>;
  /** Terminate this exact runtime utility. Idempotent. */
  dispose(): void;
};

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const isMessagePortMain = (value: unknown): value is MessagePortMain =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as { postMessage?: unknown }).postMessage === 'function' &&
  typeof (value as { on?: unknown }).on === 'function' &&
  typeof (value as { start?: unknown }).start === 'function' &&
  typeof (value as { close?: unknown }).close === 'function';

/**
 * One supervised utility, from its fork to the exit its listeners report.
 *
 * A pooled spare is the same record with no `hostId`: it is forked before any
 * request exists, so the identity, the renderer that leases it and the exit
 * observer are all assigned when a request adopts it.
 */
type LiveUtility = {
  readonly utility: UtilityProcess;
  /** Same entry and same environment: what makes a spare adoptable. */
  readonly key: string;
  sender?: IpcMainEvent['sender'];
  /** Assigned on adoption; absent while the record is an idle spare. */
  hostId?: string;
  onExit?: (exit: ElectronRuntimeHostExit) => void;
  /** Set before `kill()`, so the `'exit'` listener can attribute the death. */
  released: boolean;
  /** Last {@link maxStderrTailChars} characters the utility wrote to stderr. */
  stderrTail: string;
  computeServer?: { dispose(): void };
};

/**
 * Pool identity of one fork.
 *
 * Only the entry and the environment can differ between two forks of one
 * broker — `execArgv`, `serviceName`, `stdio` and the working directory are
 * broker-wide — so they are the whole key (D17).
 *
 * @param entry - Resolved utility entry path.
 * @param env - Environment the utility would be forked with.
 * @returns A string equal exactly for forks that produce interchangeable processes.
 */
const forkKey = (entry: string, env: ForkOptions['env']): string =>
  JSON.stringify([
    entry,
    env === undefined ? null : Object.entries(env).sort(([left], [right]) => left.localeCompare(right)),
  ]);

/* Bounds on the renderer-supplied fork context. It arrives on the same IPC
 * channel any frame holding the preload bridge may send on, so it is untrusted
 * input at a process-spawning boundary: a whole-record refusal (never a silent
 * drop) keeps a malformed context from forking a differently-configured
 * utility. The numbers are generous for `projectRoot`/`definition`-shaped
 * records and small enough that a hostile frame cannot grow main's heap. */
const maxForkContextEntries = 32;
const maxForkContextChars = 8192;
const maxRuntimeRequestIdChars = 128;
/* Enough for the Node boot stack this exists to capture, and small enough that
 * a chatty utility cannot grow main's heap. Characters rather than bytes: the
 * difference only makes the bound slightly generous for a non-ASCII tail. */
const maxStderrTailChars = 4096;
/* One utility per open project plus a little slack, which is what a person can
 * have open at once; past it the honest answer is a refusal naming the cap
 * rather than an operating system that starts killing processes. */
const defaultMaxUtilities = 8;
/* Electron emits a utility's `'exit'` before it has delivered the piped
 * stderr, so a boot death — `ERR_MODULE_NOT_FOUND` a millisecond after the
 * fork — is reported with an empty tail unless the exit report waits for the
 * stream to end. The bound keeps a stream that never ends (a killed utility
 * whose pipe stays open) from withholding the exit report altogether. */
/** Milliseconds. */
const stderrDrainTimeout = 250;
/* Own, enumerable `__proto__` is what `JSON.parse` and `defineProperty`
 * produce; assigning it onto the resolver's record is the pollution path. */
const unsafeForkContextKeys: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate one renderer-supplied fork context into a flat string record.
 *
 * @param payload - Raw IPC payload accompanying the port request.
 * @returns The sanitized context, empty when the renderer sent none.
 */
const sanitizeForkContext = (payload: unknown): Record<string, string> => {
  if (payload === undefined || payload === null) {
    return {};
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('registerElectronRuntimeMain: fork context must be a string record');
  }
  const entries = Object.entries(payload);
  if (entries.length > maxForkContextEntries) {
    throw new Error(`registerElectronRuntimeMain: fork context exceeds ${maxForkContextEntries} entries`);
  }
  const context: Record<string, string> = {};
  let characters = 0;
  for (const [key, value] of entries) {
    if (unsafeForkContextKeys.has(key)) {
      throw new Error(`registerElectronRuntimeMain: fork context key "${key}" is not allowed`);
    }
    if (typeof value !== 'string') {
      throw new TypeError(`registerElectronRuntimeMain: fork context value for "${key}" is not a string`);
    }
    characters += key.length + value.length;
    if (characters > maxForkContextChars) {
      throw new Error(`registerElectronRuntimeMain: fork context exceeds ${maxForkContextChars} characters`);
    }
    context[key] = value;
  }
  return context;
};

/**
 * Wait for one piped stream to end, bounded by {@link stderrDrainTimeout}.
 *
 * @param stream - The utility's piped stream, absent when stdio is inherited.
 * @returns Nothing, once the stream ended or the bound elapsed.
 */
const drainStream = async (stream: UtilityProcess['stderr']): Promise<void> => {
  if (!stream) {
    return;
  }
  await new Promise<void>((resolve) => {
    const drainTimer = setTimeout(resolve, stderrDrainTimeout);
    const finishDrain = (): void => {
      clearTimeout(drainTimer);
      resolve();
    };
    stream.on('end', finishDrain);
    stream.on('close', finishDrain);
  });
};

const readRuntimePortRequest = (payload: unknown): { readonly context?: unknown; readonly requestId: string } => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('registerElectronRuntimeMain: runtime port request must be an object');
  }
  const { context, requestId } = payload as { context?: unknown; requestId?: unknown };
  if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > maxRuntimeRequestIdChars) {
    throw new TypeError('registerElectronRuntimeMain: runtime port request ID must be a non-empty bounded string');
  }
  return { context, requestId };
};

/* Document headers this handler manages, in canonical casing — the complete
 * canonical set, CORP included. CORP is safe here *because* the handler is
 * registered with a document-only filter (see `documentResponseFilter`): the
 * cross-origin API responses that a `require-corp` document would then reject
 * never reach it. Restoring CORP reverses the earlier unconditional exclusion,
 * whose stated precondition — an unfiltered handler that rewrites every
 * response in the session — no longer holds (see
 * `docs/research/runtime-desktop-crossover-batch-d-blueprint.md`, D3(c)).
 * Residual: a cross-origin `subFrame` document response now carries
 * `same-origin`; under `require-corp` such a frame is already excluded unless
 * it opts in. Narrow to `types: ['mainFrame']` if cross-origin iframes are
 * ever needed. */
const managedHeaders: ReadonlyArray<readonly [string, string]> = Object.entries(documentHeaders);
const managedHeaderNamesLc: ReadonlySet<string> = new Set(managedHeaders.map(([name]) => name.toLowerCase()));

/* `<all_urls>`, never a scheme-wildcard pattern: the wildcard form does not
 * match the custom standard schemes (`app://`) that `protocol.handle` serves a
 * packaged renderer from, which is exactly where cross-origin isolation fails. */
const documentResponseFilter: WebRequestFilter = { urls: ['<all_urls>'], types: ['mainFrame', 'subFrame'] };

/**
 * Install COOP/COEP response headers for Electron renderer pages.
 *
 * @param options - Optional Electron session override.
 * @returns Nothing.
 * @public
 */
export const installElectronRuntimeHeaders = (options: ElectronRuntimeHeadersOptions = {}): void => {
  const targetSession = options.session ?? defaultSession.defaultSession;
  targetSession.webRequest.onHeadersReceived(documentResponseFilter, (details, callback) => {
    /* Electron delivers response headers with lowercase keys; adding a
     * Title-Case copy leaves the name case-duplicated, and Chromium then
     * refuses cross-origin isolation on a custom scheme. Upsert case-
     * insensitively instead, leaving unrelated headers and their casing alone.
     * Not `applyDocumentHeaders`: its `Object.assign` would re-add Title-Case
     * keys beside the lowercase ones Electron delivered. */
    const responseHeaders: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(details.responseHeaders ?? {})) {
      if (!managedHeaderNamesLc.has(name.toLowerCase())) {
        responseHeaders[name] = value;
      }
    }
    for (const [name, value] of managedHeaders) {
      responseHeaders[name] = [value];
    }
    callback({ responseHeaders });
  });
};

/**
 * Register the main-process broker that owns one utility host per renderer client.
 * Each relayed port carries an opaque lease used for exact-host close and timeout recovery.
 *
 * Admission is the application's: every `requestRuntimePort()` from any frame
 * holding the preload bridge forks one utility, and the broker imposes no cap.
 * An application that must gate this — by sender, or with a concurrency cap —
 * supplies its own `ipcMain` view that filters before delegating. The broker
 * owns the only listeners on its channels, so `off` may delegate wholesale:
 *
 * ```typescript
 * import { ipcMain } from 'electron';
 * import type { IpcMain, IpcMainEvent } from 'electron';
 *
 * const allowFrame = (event: IpcMainEvent): boolean => event.senderFrame?.url.startsWith('app://') === true;
 * const gatedIpcMain = {
 *   on: (channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void) =>
 *     ipcMain.on(channel, (event, ...args) => {
 *       if (allowFrame(event)) {
 *         listener(event, ...args);
 *       }
 *     }),
 *   off: (channel: string) => ipcMain.removeAllListeners(channel),
 * } as unknown as IpcMain;
 * ```
 *
 * Each request carries an opaque correlation identity and may carry a renderer-supplied
 * context (`requestRuntimePort(requestId, context)`).
 * The broker sanitizes it to a bounded flat string record — refusing the whole
 * request otherwise — and hands it to the application's `resolveFork`, whose
 * returned environment must name only allowlisted keys.
 *
 * @param options - Utility entry and optional Electron wiring overrides.
 * @returns A handle that unregisters IPC listeners and terminates remaining owned utilities.
 * @public
 *
 * @example <caption>Register and dispose the Electron runtime broker</caption>
 * ```typescript
 * import { registerElectronRuntimeMain } from '@taucad/runtime/electron/main';
 *
 * const runtimeMain = registerElectronRuntimeMain({
 *   utilityEntry: new URL('./runtime.utility.js', import.meta.url),
 * });
 * runtimeMain.dispose();
 * ```
 */
export const registerElectronRuntimeMain = (options: RegisterElectronRuntimeMainOptions): ElectronRuntimeMainHandle => {
  const channel = options.channel ?? electronRuntimeChannel;
  const releaseChannel = `${channel}:release`;
  const targetIpcMain = options.ipcMain ?? defaultIpcMain;
  const forkEnvAllowlist: ReadonlySet<string> = new Set(options.forkEnvAllowlist ?? []);
  const liveUtilities = new Map<string, LiveUtility>();
  const maxUtilities = options.maxUtilities ?? defaultMaxUtilities;
  let spare: LiveUtility | undefined;
  let disposed = false;

  const reportError = (error: unknown): void => {
    options.onError?.(toError(error));
  };

  /**
   * Fork one utility that no request owns yet.
   *
   * Its piped streams are read from the first byte — a stream nobody reads
   * fills and stalls the child — but nothing is *reported* until adoption,
   * because before that there is no host to attribute the bytes to.
   *
   * @param utilityEntry - Resolved entry module.
   * @param env - Environment for the fork, or undefined to inherit main's.
   * @param key - {@link forkKey} for this entry and environment.
   * @returns The unadopted record.
   */
  const forkUtility = (utilityEntry: string, env: ForkOptions['env'], key: string): LiveUtility => {
    const spawnedUtility = utilityProcess.fork(utilityEntry, [], {
      env,
      /* Copied because Electron declares `execArgv?: string[]` (TS4104). */
      ...(options.execArgv === undefined ? {} : { execArgv: [...options.execArgv] }),
      serviceName: options.serviceName ?? 'tau-runtime-host',
      stdio: options.stdio ?? 'pipe',
    });
    const record: LiveUtility = { utility: spawnedUtility, key, released: false, stderrTail: '' };
    /* A piped stream nobody reads fills and stalls the child, so both are read
     * whether or not an observer is installed. stdout is the utility's own
     * logging concern; stderr is kept because it is the only account of a boot
     * death, which by definition never reaches the runtime wire. */
    spawnedUtility.stdout?.resume();
    spawnedUtility.stderr?.on('data', (chunk: unknown) => {
      const text = String(chunk);
      record.stderrTail = (record.stderrTail + text).slice(-maxStderrTailChars);
      if (record.hostId !== undefined) {
        options.onUtilityStderr?.({ hostId: record.hostId, chunk: text });
      }
    });
    /* Named rather than an IIFE, and read after the drain: the tail that
     * explains a boot death only exists once the pipe has been delivered. */
    const reportExit = async (hostId: string, code: number): Promise<void> => {
      record.computeServer?.dispose();
      await drainStream(spawnedUtility.stderr);
      const exit: ElectronRuntimeHostExit = {
        exitCode: code,
        released: record.released,
        ...(record.stderrTail === '' ? {} : { stderrTail: record.stderrTail }),
      };
      options.onUtilityExit?.({ hostId, ...exit });
      record.onExit?.(exit);
    };
    spawnedUtility.on('exit', (code: number) => {
      /* Synchronous, so a re-fork racing the drain never sees the dead record. */
      if (spare === record) {
        spare = undefined;
      }
      const { hostId } = record;
      /* A spare that died before adoption leases nothing and owes no report:
       * whatever killed it kills the next fork of the same entry too, and that
       * one has a host to report against. */
      if (hostId !== undefined) {
        liveUtilities.delete(hostId);
        void reportExit(hostId, code);
      }
    });
    return record;
  };

  const releaseSpare = (): void => {
    const record = spare;
    if (!record) {
      return;
    }
    spare = undefined;
    record.released = true;
    try {
      record.utility.kill();
    } catch {
      /* Best-effort */
    }
  };

  /**
   * Take the spare when it was warmed for exactly this fork, fork otherwise.
   *
   * @param utilityEntry - Resolved entry module.
   * @param env - Environment this request resolved to.
   * @param key - {@link forkKey} for that pair.
   * @returns An unadopted record, warm or cold.
   * @throws ElectronRuntimeUtilityLimitError When the broker is already at its cap.
   */
  const acquireUtility = (utilityEntry: string, env: ForkOptions['env'], key: string): LiveUtility => {
    if (spare !== undefined && spare.key !== key) {
      /* The pool follows the contexts this application actually forks: a spare
       * no request can adopt is memory, not warmth. */
      releaseSpare();
    }
    if (spare === undefined) {
      if (liveUtilities.size >= maxUtilities) {
        throw new ElectronRuntimeUtilityLimitError(maxUtilities);
      }
      return forkUtility(utilityEntry, env, key);
    }
    const record = spare;
    spare = undefined;
    return record;
  };

  /**
   * Hold one idle utility for the next request with this key.
   *
   * @param utilityEntry - Resolved entry module.
   * @param env - Environment the next request of this key would fork with.
   * @param key - {@link forkKey} for that pair.
   */
  const ensureSpare = (utilityEntry: string, env: ForkOptions['env'], key: string): void => {
    /* The spare is inside the cap, never above it: the pool trades a process
     * the application would have forked anyway for latency, not more memory. */
    if (disposed || spare !== undefined || liveUtilities.size >= maxUtilities) {
      return;
    }
    try {
      spare = forkUtility(utilityEntry, env, key);
    } catch (error) {
      reportError(error);
    }
  };

  const releaseUtility = (hostId: string): void => {
    const record = liveUtilities.get(hostId);
    if (!record) {
      return;
    }
    liveUtilities.delete(hostId);
    /* Before `kill()`: the `'exit'` listener reads this to report a supervised
     * shutdown as such, and Electron owns when that listener runs. */
    record.released = true;
    record.computeServer?.dispose();
    try {
      record.utility.kill();
    } catch {
      /* Best-effort */
    }
  };

  const spawnRuntime = (
    context: unknown,
    onExit?: (exit: ElectronRuntimeHostExit) => void,
    sender?: IpcMainEvent['sender'],
  ): { readonly hostId: string; readonly port: MessagePortMain } => {
    /* Optional-call short-circuit: with no resolver the context is never even
     * validated, because nothing reads it — the pre-resolver behaviour, exactly. */
    const resolved = options.resolveFork?.(sanitizeForkContext(context)) ?? {};
    try {
      if (resolved.fileSystemPort !== undefined && !isMessagePortMain(resolved.fileSystemPort)) {
        throw new TypeError('registerElectronRuntimeMain: resolveFork returned an invalid filesystem port');
      }
      for (const name of Object.keys(resolved.env ?? {})) {
        if (!forkEnvAllowlist.has(name)) {
          throw new Error(`registerElectronRuntimeMain: resolveFork returned disallowed environment key "${name}"`);
        }
      }
    } catch (error) {
      if (isMessagePortMain(resolved.fileSystemPort)) {
        resolved.fileSystemPort.close();
      }
      throw error;
    }
    const resolvedEntry = resolved.utilityEntry ?? options.utilityEntry;
    const utilityEntry = resolvedEntry instanceof URL ? fileURLToPath(resolvedEntry) : resolvedEntry;
    const env = resolved.env === undefined ? options.env : { ...options.env, ...resolved.env };
    const key = forkKey(utilityEntry, env);
    const adopted = spare?.key === key;
    let record: LiveUtility;
    try {
      record = acquireUtility(utilityEntry, env, key);
    } catch (error) {
      resolved.fileSystemPort?.close();
      throw error;
    }
    const spawnedUtility = record.utility;
    const hostId = randomUUID();
    record.hostId = hostId;
    if (sender !== undefined) {
      record.sender = sender;
    }
    if (onExit !== undefined) {
      record.onExit = onExit;
    }
    liveUtilities.set(hostId, record);
    options.onUtilityFork?.({ hostId, entry: utilityEntry });

    let ports: MessageChannelMain | undefined;
    let computePorts: MessageChannelMain | undefined;
    try {
      ports = new MessageChannelMain();
      const transferred = [ports.port2];
      const runtimePortIndex = 0;
      const compute = resolved.compute ?? options.compute;
      let computeStorePortIndex: number | undefined;
      let fileSystemPortIndex: number | undefined;
      if (compute?.mode === 'durable') {
        const authority = _resolveComputeStore(compute.store);
        if (!authority) {
          throw new TypeError('registerElectronRuntimeMain: compute binding contains an unregistered store capability');
        }
        computePorts = new MessageChannelMain();
        const readGeneration = async () => {
          const report = await authority.control.inspect({});
          return report.generation;
        };
        record.computeServer = exposeComputeStoreChannel({
          port: wrapMessagePortMain(computePorts.port1, { label: 'electron-main:compute' }),
          engine: authority.engine,
          workspace: authority.workspace,
          generation: authority.generation ?? readGeneration,
        });
        computeStorePortIndex = transferred.push(computePorts.port2) - 1;
      }
      if (resolved.fileSystemPort !== undefined) {
        fileSystemPortIndex = transferred.push(resolved.fileSystemPort) - 1;
      }
      spawnedUtility.postMessage(
        {
          taucadRuntime: true,
          runtimePortIndex,
          ...(computeStorePortIndex === undefined ? {} : { computeStorePortIndex }),
          ...(fileSystemPortIndex === undefined ? {} : { fileSystemPortIndex }),
          ...(compute?.mode === 'off' ? { computeBindingMode: 'off' } : {}),
        },
        transferred,
      );
      /* Only after an adoption: a broker that never prewarmed asked for no
       * pool, and the day it does ask, the spare it just spent is replaced so
       * the *next* open is warm too. */
      if (adopted) {
        ensureSpare(utilityEntry, env, key);
      }
      return { hostId, port: ports.port1 };
    } catch (error) {
      try {
        ports?.port1.close();
        ports?.port2.close();
        computePorts?.port1.close();
        computePorts?.port2.close();
        resolved.fileSystemPort?.close();
      } catch {
        /* Best-effort */
      }
      releaseUtility(hostId);
      throw error;
    }
  };

  const listener = (event: IpcMainEvent, payload?: unknown): void => {
    let hostId: string | undefined;
    try {
      const targetFrame = event.senderFrame;
      if (!targetFrame) {
        throw new Error('registerElectronRuntimeMain: IPC event did not include senderFrame');
      }
      const { context, requestId } = readRuntimePortRequest(payload);
      const spawned = spawnRuntime(
        context,
        (exit) => {
          try {
            targetFrame.postMessage(`${channel}:host-exit`, { hostId: spawned.hostId, ...exit });
          } catch (error) {
            reportError(error);
          }
        },
        event.sender,
      );
      hostId = spawned.hostId;
      /* Main is the only process that sees the utility's exit code, whether the
       * kill was its own, and what the utility last wrote to stderr. Relay all
       * three to the same frame the port goes to, so the renderer client can
       * settle `closed` with them; `WebFrameMain.postMessage` throws on a
       * destroyed frame, which must not take the bookkeeping down with it. */
      targetFrame.postMessage(`${channel}:port`, { hostId, requestId }, [spawned.port]);

      const releaseOnce = (): void => {
        if (hostId) {
          releaseUtility(hostId);
        }
      };
      event.sender.once('destroyed', releaseOnce);
      /* A crashed renderer never fires `pagehide` and is never `destroyed`
       * until its window closes; only main sees this. `releaseUtility` is
       * idempotent, so a later `'destroyed'` is harmless. */
      event.sender.once('render-process-gone', releaseOnce);
    } catch (error) {
      if (hostId) {
        releaseUtility(hostId);
      }
      reportError(error);
    }
  };

  const releaseListener = (event: IpcMainEvent, payload: unknown): void => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const { hostId } = payload as { hostId?: unknown };
    if (typeof hostId !== 'string') {
      return;
    }
    const record = liveUtilities.get(hostId);
    if (!record || record.sender !== event.sender) {
      return;
    }
    releaseUtility(hostId);
  };

  targetIpcMain.on(channel, listener);
  targetIpcMain.on(releaseChannel, releaseListener);

  return {
    connect(input) {
      if (disposed) {
        throw new Error('registerElectronRuntimeMain: broker is disposed');
      }
      const { purpose } = input as { readonly purpose?: unknown };
      if (purpose !== 'main-process-client') {
        throw new Error('registerElectronRuntimeMain: unknown main-process connection purpose');
      }
      let resolveClosed: ((result: ElectronRuntimeHostExit) => void) | undefined;
      const closed = new Promise<ElectronRuntimeHostExit>((resolve) => {
        resolveClosed = resolve;
      });
      const spawned = spawnRuntime(input.context, (exit) => {
        resolveClosed?.(exit);
      });
      return {
        port: spawned.port,
        closed,
        dispose(): void {
          releaseUtility(spawned.hostId);
        },
      };
    },
    dispose(): void {
      disposed = true;
      targetIpcMain.off(channel, listener);
      targetIpcMain.off(releaseChannel, releaseListener);
      releaseSpare();
      for (const hostId of liveUtilities.keys()) {
        releaseUtility(hostId);
      }
    },
    prewarm(): void {
      if (disposed) {
        throw new Error('registerElectronRuntimeMain: broker is disposed');
      }
      const entry = options.utilityEntry instanceof URL ? fileURLToPath(options.utilityEntry) : options.utilityEntry;
      ensureSpare(entry, options.env, forkKey(entry, options.env));
    },
  };
};
