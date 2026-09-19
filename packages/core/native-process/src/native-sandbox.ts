import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

import { getDefaultWritePaths, SandboxManager } from '@anthropic-ai/sandbox-runtime';

/**
 * The operating-system sandbox could not be established, so no native worker was started.
 *
 * Native execution never falls back to an unsandboxed child: callers surface this as an
 * ordinary runtime error naming the missing platform prerequisite.
 *
 * @public
 */
export class NativeRuntimeUnavailableError extends Error {
  /** Stable machine-readable code for hosts that map runtime failures to user-facing states. */
  public get code(): 'NATIVE_RUNTIME_UNAVAILABLE' {
    return 'NATIVE_RUNTIME_UNAVAILABLE';
  }

  public constructor(reason: string, options?: ErrorOptions) {
    super(`The native runtime is unavailable because its sandbox could not start: ${reason}`, options);
    this.name = 'NativeRuntimeUnavailableError';
  }
}

/** Host-owned launch vector for one contained native worker. @public */
export type NativeSandboxLaunch = {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  /** Read-only roots the worker needs: the bundled runtime and the mirrored source snapshot. */
  readonly readablePaths: readonly string[];
  /** The single writable root: artifacts, temporary files, and the worker's private home. */
  readonly writablePath: string;
  readonly workingDirectory: string;
  /** Opaque key that attributes sandbox violations to this launch. */
  readonly commandId: string;
};

const physicalVariants = (paths: readonly string[]): string[] => {
  const variants = new Set<string>();
  for (const path of paths) {
    variants.add(path);
    try {
      variants.add(realpathSync(path));
    } catch {
      // A root that does not exist on this host still deserves its literal deny entry.
    }
  }
  return [...variants];
};

/**
 * Roots a native worker may never read: every user home, removable volume, and shared temporary storage.
 *
 * @returns Logical and physical spellings of each root.
 */
const deniedReadRoots = (): string[] =>
  physicalVariants([homedir(), '/Users', '/home', '/root', '/Volumes', '/mnt', '/media', '/tmp', tmpdir()]);

/**
 * Shared roots the sandbox runtime grants every command by default, which a CAD worker must not have.
 *
 * The runtime unions {@link getDefaultWritePaths} into the emitted write allowance, so the profile
 * would otherwise let user-authored C# or Python write into `/tmp/claude`, `~/.npm/_logs` and
 * `~/.claude/debug` — directories other tooling reads, i.e. an influence channel out of the sandbox.
 * Reading the roots back from the same export keeps a runtime upgrade from re-opening the hole with a
 * new default. Character devices stay writable because the worker's stdio needs them.
 *
 * @returns Every default write root except the `/dev` devices.
 */
const deniedWriteRoots = (): string[] => getDefaultWritePaths().filter((path) => !path.startsWith('/dev/'));

/**
 * The capability profile handed to the sandbox runtime, spelled locally so the published
 * declarations never reach into the runtime's own types.
 *
 * @public
 */
export type NativeSandboxProfile = {
  network: { allowedDomains: string[]; deniedDomains: string[]; strictAllowlist: boolean };
  filesystem: { denyRead: string[]; allowRead: string[]; allowWrite: string[]; denyWrite: string[] };
};

/**
 * The fixed Tau capability profile shared by every native CAD worker.
 *
 * Reads are denied under user homes, removable volumes, and shared temporary storage, then
 * re-allowed only for the launch's bundled runtime, source snapshot, and private writable
 * root. Writes are allowed only inside that writable root: the sandbox runtime's own broad
 * default write roots are denied back off ({@link deniedWriteRoots}).
 *
 * Network egress is **proxy-mediated, not kernel-denied**. The emitted profile pins socket
 * access to the runtime's loopback proxy ports and nothing else; the proxy then refuses every
 * destination because the allowlist is empty, `*` is denied, and no interactive callback exists
 * to widen it. Declaring `allowedDomains` is what selects that restricted path — removing the
 * network facet makes the runtime emit `(allow network*)` instead, which is the inversion of
 * this invariant. A kernel-level "no sockets at all" option does not exist in the pinned runtime.
 *
 * @public
 * @param launch - Paths of one launch; omit for the process-wide baseline used at initialization.
 * @returns A complete sandbox-runtime configuration.
 */
export const nativeSandboxPolicy = (
  launch?: Pick<NativeSandboxLaunch, 'readablePaths' | 'writablePath'>,
): NativeSandboxProfile => ({
  network: { allowedDomains: [], deniedDomains: ['*'], strictAllowlist: true },
  filesystem: {
    denyRead: deniedReadRoots(),
    allowRead: launch ? physicalVariants([...launch.readablePaths, launch.writablePath]) : [],
    allowWrite: launch ? physicalVariants([launch.writablePath]) : [],
    denyWrite: deniedWriteRoots(),
  },
});

const unavailable = (error: unknown): NativeRuntimeUnavailableError =>
  error instanceof NativeRuntimeUnavailableError
    ? error
    : new NativeRuntimeUnavailableError(error instanceof Error ? error.message : String(error), { cause: error });

let initialization: Promise<void> | undefined;

const ensureInitialized = async (): Promise<void> => {
  initialization ??= (async () => {
    if (process.platform === 'win32') {
      // The released Windows backend cannot grant per-launch filesystem paths; see the blueprint's release gates.
      throw new NativeRuntimeUnavailableError('Windows is not yet a supported native runtime platform.');
    }
    if (!SandboxManager.isSupportedPlatform()) {
      throw new NativeRuntimeUnavailableError(`${process.platform} has no supported sandbox backend.`);
    }
    const dependencies = await SandboxManager.checkDependenciesAsync();
    if (dependencies.errors.length > 0) {
      throw new NativeRuntimeUnavailableError(dependencies.errors.join('; '));
    }
    await SandboxManager.initialize(nativeSandboxPolicy());
  })();
  const attempt = initialization;
  try {
    await attempt;
  } catch (error) {
    // A later launch may retry once the operator installs the missing prerequisite; only the
    // failed attempt is forgotten, never a newer one already under way.
    if (initialization === attempt) {
      initialization = undefined;
    }
    throw unavailable(error);
  }
};

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/**
 * Wrap one host-owned executable and argument vector in the fixed Tau sandbox.
 *
 * The returned vector is spawned with `shell: false`; only host-owned paths and fixed worker
 * arguments are quoted into the wrapper command, never project content.
 *
 * @public
 * @param launch - Executable, arguments, and the paths the worker may use.
 * @returns The spawn vector, or a rejection with {@link NativeRuntimeUnavailableError}.
 */
export const launchInNativeSandbox = async (launch: NativeSandboxLaunch): Promise<readonly string[]> => {
  await ensureInitialized();
  const vector = [launch.executablePath, ...launch.arguments].map((value) => quote(value)).join(' ');
  // The runtime's wrapper points TMPDIR at its own shared `/tmp/claude`, which this profile denies;
  // the worker's temporary files belong in its private artifact root.
  const temporary = ['TMPDIR', 'TEMP', 'TMP'].map((name) => `${name}=${quote(launch.writablePath)}`).join(' ');
  const command = `${temporary} exec ${vector}`;
  try {
    const { argv } = await SandboxManager.wrapWithSandboxArgv(
      command,
      '/bin/sh',
      nativeSandboxPolicy(launch),
      undefined,
      launch.workingDirectory,
      { commandId: launch.commandId },
    );
    return argv;
  } catch (error) {
    throw unavailable(error);
  }
};
