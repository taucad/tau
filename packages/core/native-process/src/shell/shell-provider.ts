/**
 * The launch-session seam between Tau's shell service and the operating-system sandbox (blueprint D3, D20).
 *
 * The host compiles a Tau-shaped launch; the provider either enforces all of it or says which requirement it cannot
 * enforce. Nothing here names SRT, Seatbelt, bubblewrap or a Windows mechanism. A provider is chosen once at
 * composition by platform and probe and never switched at run time; there is no provider registry.
 
 */

/**
 * Exact network destinations one launch may reach through its own isolated proxy. Empty means deny all. The proxy
 * admits only this launch's own credential (never a source address or SID, which Windows sessions share).
 *
 * @public
 */
export type ShellNetwork = Readonly<{ domains: readonly string[] }>;

/**
 * The filesystem one launch may touch, as absolute native paths the host has already resolved.
 *
 * `writable` includes the private HOME and temporary roots. `readOnly` names paths inside a readable or writable root
 * that the launch may read but never write or replace, such as a checkout's records. `denied` wins over all three. The
 * provider always adds the baseline read-deny set ({@link shellBaselineDenied}) to it, so a host that forgets an entry
 * cannot open it. `directories` names the protected paths that are directories when present (the path registry's
 * directory rows), so a Linux launch stands in for an absent one with an empty directory rather than a file.
 *
 * @public
 */
export type ShellFilesystem = Readonly<{
  readable: readonly string[];
  writable: readonly string[];
  readOnly?: readonly string[] | undefined;
  denied: readonly string[];
  directories?: readonly string[] | undefined;
}>;

/** Durable identity prepared before any command can run. @public */
export type PreparedShell = Readonly<{ executionId: string }>;

/** A host-owned project or checkout binding. The provider never interprets its key. @public */
export type ShellResource = Readonly<{ key: string; root: string }>;

/** What {@link ShellProvider.prepare} records before any process exists. @public */
export type ShellPreparation = Readonly<{ privateRoot: string; resource: ShellResource | undefined }>;

/** Durable custody metadata; an explicitly absent resource denotes a private-only probe. @public */
export type ShellExecution = PreparedShell & Readonly<{ privateRoot: string; resource: ShellResource | undefined }>;

/**
 * A scoped recovery result. Stopped retains exclusive custody until release; blocked grants no deletion authority.
 *
 * @public
 */
export type ShellRecovery = ShellExecution &
  (Readonly<{ status: 'stopped' }> | Readonly<{ status: 'blocked'; message: string }>);

/** Terminal dimensions, in cells. @public */
export type ShellTerminalSize = Readonly<{ columns: number; rows: number }>;

/**
 * How the process talks: pipes with stdin closed (agent), or a PTY (Terminal pane). A `terminal` launch promises a
 * controlling terminal with job control inside the sandbox; a provider that cannot give one answers
 * `unsupported: terminal`, never a PTY without Ctrl-C.
 *
 * @public
 */
export type ShellStdio = Readonly<{ kind: 'pipes' }> | Readonly<{ kind: 'terminal'; size: ShellTerminalSize }>;

/**
 * One contained shell launch.
 *
 * @public
 */
export type ShellLaunch = Readonly<{
  /**
   * The execution {@link ShellProvider.prepare} returned for this launch (I7). A provider refuses an execution it did
   * not prepare, or one that already launched, before anything starts.
   */
  executionId: string;
  /** The resolved shell executable ({@link resolveShellExecutable}). */
  executablePath: string;
  /** Arguments after the executable, such as `['--noprofile', '--norc', '-c', command]`; never reinterpreted. */
  arguments: readonly string[];
  /** Absolute native working directory inside `filesystem.readable` or `filesystem.writable`. */
  workingDirectory: string;
  /** Opaque key that attributes sandbox violations to this launch. */
  commandId: string;
  filesystem: ShellFilesystem;
  network: ShellNetwork;
  /**
   * The complete child environment, built by the host from an allowlist. The provider refuses startup hooks, loader
   * or injection variables, agent sockets, proxy settings and credentials ({@link refusedShellEnvironment}).
   */
  environment: Readonly<Record<string, string>>;
  stdio: ShellStdio;
  /** Aborting terminates the whole owned process tree; `exited` then settles. */
  signal: AbortSignal;
}>;

/**
 * What a provider could not enforce. A provider never ignores a field it cannot honour.
 *
 * @public
 */
export type ShellRequirement =
  | 'platform'
  | 'filesystem-mask'
  | 'network-isolation'
  | 'descendant-containment'
  | 'environment'
  | 'terminal';

/**
 * How a contained process ended. `exitCode` is the shell's own status; `signal` names the signal that ended it.
 *
 * @public
 */
export type ShellExit =
  | Readonly<{ exitCode: number; signal?: undefined }>
  | Readonly<{ exitCode?: undefined; signal: string }>;

/**
 * A running contained process.
 *
 * `exited` resolves only after the shell has exited **and** every owned descendant is confirmed stopped, so a host that
 * awaits it may release a checkout afterwards (I7). When cleanup cannot be confirmed (a survivor, or an unreadable
 * process table) it rejects instead: output iterables still end, but the host keeps the launch's roots and checkout and
 * reports the command `interrupted`, never a completed result. Disposal terminates the whole owned process tree and
 * settles at the same point.
 *
 * @public
 */
type ShellProcessBase = AsyncDisposable &
  Readonly<{
    exited: Promise<ShellExit>;
    /** Terminate the owned process tree; settles with {@link ShellProcessBase.exited}. */
    terminate: () => Promise<ShellExit>;
  }>;

/** @public */
export type ShellPipesProcess = ShellProcessBase &
  Readonly<{
    kind: 'pipes';
    stdout: AsyncIterable<Uint8Array<ArrayBuffer>>;
    stderr: AsyncIterable<Uint8Array<ArrayBuffer>>;
  }>;

/** @public */
export type ShellTerminalProcess = ShellProcessBase &
  Readonly<{
    kind: 'terminal';
    output: AsyncIterable<Uint8Array<ArrayBuffer>>;
    write: (bytes: Uint8Array<ArrayBuffer>) => void;
    resize: (size: ShellTerminalSize) => void;
  }>;

/** @public */
export type ShellProcess = ShellPipesProcess | ShellTerminalProcess;

/**
 * The result of one launch. `unsupported` names a requirement this provider can never enforce; `sandbox-unavailable`
 * is a missing or broken prerequisite on this device (a later launch may succeed once it is repaired). Neither
 * started anything.
 *
 * @public
 */
export type ShellLaunchOutcome =
  | Readonly<{ status: 'started'; process: ShellProcess }>
  | Readonly<{ status: 'unsupported'; requirement: ShellRequirement; message: string }>
  | Readonly<{ status: 'sandbox-unavailable'; message: string }>;

/**
 * The replaceable boundary: one implementation per platform family plus a deterministic test fake.
 *
 * @public
 */
export type ShellProvider = Readonly<{
  /** Stable name recorded on every receipt (I12), such as `srt-0.0.75` or `codex-restricted-token-fallback`. */
  name: string;
  /**
   * Durably record the intent to launch before any process exists (I7): a fresh execution identity, the private root it
   * may write and the project resource it runs against (`undefined` only for a private-only probe). Rejects when the
   * custody record cannot be written; nothing may launch then.
   */
  prepare: (input: ShellPreparation) => Promise<PreparedShell>;
  /**
   * Start a prepared execution. Any outcome other than `started`, and a rejection, ran no workload; the caller then
   * {@link ShellProvider.recover recovers} the execution before it deletes the private roots.
   */
  launch: (launch: ShellLaunch) => Promise<ShellLaunchOutcome>;
  /** Every durable execution in this provider's custody namespace, read-only. Rejects on any unreadable record. */
  inventory: () => Promise<readonly ShellExecution[]>;
  /**
   * Claim exactly the named executions: `stopped` only once every registered process is confirmed gone, keeping
   * exclusive custody until {@link ShellProvider.release}; `blocked` grants nothing. A live owner is never taken over.
   */
  recover: (input: Readonly<{ executionIds: readonly string[] }>) => Promise<readonly ShellRecovery[]>;
  /** Erase a stopped execution's receipt after its private root is deleted and every other hold is released. */
  release: (input: PreparedShell) => Promise<void>;
}>;
