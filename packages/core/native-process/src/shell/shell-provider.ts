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
  /**
   * Containers hidden except for explicit strict-descendant readable, writable and read-only roots. Ancestor
   * grants never reopen their children; denied still wins. Existing containers must be real directories.
   * Absent containers require a canonical immediate parent and remain uncreatable on Linux.
   * Linux rebinds existing children: file roots cannot be created if absent, deleted or atomically replaced,
   * and absent directory roots are omitted. Unknown temporary children never reach the host filesystem.
   * On both platforms a file root cannot be atomically replaced through a temporary sibling inside the
   * container, because that sibling is an unknown child. Listing the container shows only the opened
   * children on Linux and is refused on macOS, as is listing a directory between it and an opened child.
   * Recursive tools run from the checkout (`find`, `grep -r`, `ls -R`) therefore report an error and exit
   * non-zero on macOS. A hidden entry fails with EPERM on macOS but ENOENT on Linux, so on macOS a guessed
   * name can be confirmed to exist, though never read, listed or stat-ed.
   */
  masked?: readonly string[] | undefined;
  directories?: readonly string[] | undefined;
}>;

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
 * `exited` settles only after the shell has exited **and** every owned descendant has stopped, so a host that awaits
 * it may release a checkout afterwards (I7). Disposal terminates the whole owned process tree and resolves at the same
 * point. Output iterables end once every writer is gone.
 *
 * @public
 */
type ShellProcessBase = AsyncDisposable &
  Readonly<{
    exited: Promise<ShellExit>;
    /** Terminate the owned process tree; resolves with {@link ShellProcessBase.exited}. */
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
  launch: (launch: ShellLaunch) => Promise<ShellLaunchOutcome>;
}>;
