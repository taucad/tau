/**
 * Environment allowlist for forked utility processes (work item E2).
 *
 * `examples/electron` passes `{ ...process.env }` wholesale, which is fine for
 * an example and wrong for the app: a utility inherits the developer's shell,
 * every provider key in it, and — worse — `NODE_OPTIONS` and
 * `ELECTRON_RUN_AS_NODE`, either of which changes what the child *is*. This
 * mirrors the daemon's `minimalEnvironment` discipline
 * (`packages/host/src/runtime-child-supervisor.ts`): name what a child needs,
 * and nothing else reaches it.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const esbuildBinaryPathVariable = 'ESBUILD_BINARY_PATH';
const execFileAsync = promisify(execFile);
const pathSentinel = '__TAU_PATH__';

/** Per-shell bookkeeping that describes the probe, not the user's environment. */
const shellBookkeepingNames = new Set(['SHLVL', 'PWD', 'OLDPWD', '_', 'TERM', 'PATH']);

/**
 * Prefixes never imported from rc files: Tau's own endpoint, path and test
 * switches, Electron's runtime switches (`ELECTRON_RUN_AS_NODE`,
 * `ELECTRON_RENDERER_URL`) and Node's (`NODE_OPTIONS`). A line planted in
 * `.zshrc` must not redirect the signed app or change what it runs.
 */
const shellDeniedPrefixes = ['TAU_', 'ELECTRON_', 'NODE_'] as const;

/**
 * Where Homebrew and the vendor installers put CLIs, merged when the login
 * shell cannot answer: a probe that times out under load otherwise leaves
 * launchd's PATH, and every ACP adapter is refused `CLI_NOT_FOUND`.
 */
const fallbackPathEntries = (): readonly string[] => [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(homedir(), '.local/bin'),
];

/**
 * The environment a GUI launch never gets.
 *
 * launchd starts a macOS app with `/usr/bin:/bin:/usr/sbin:/sbin` and none of
 * the user's exported variables, so the vendor CLIs the ACP adapters drive —
 * installed by Homebrew or npm into the user's shell PATH — are invisible to a
 * packaged Tau opened from Finder: both adapters were refused `CLI_NOT_FOUND`
 * there while the same package advertised them from a terminal (G-ACP-PKG cell
 * 8). The adapter allowlist also forwards `CODEX_HOME`, proxies, CA bundles and
 * `XDG_*`, which live in the same rc files (10-review D). So ask the login
 * shell once and import all of it, as VS Code and Zed do (operator decision
 * Q13): PATH merges ahead of the launcher's, every other variable applies only
 * where the launcher set none, and shell bookkeeping and `TAU_`/`ELECTRON_`/`NODE_`
 * names are dropped.
 *
 * When the shell fails or outlives `shellTimeout`, the existing well-known CLI
 * directories merge ahead of the launcher's PATH instead, and `fallback` says so.
 *
 * Values from rc files can be secrets; log the names and counts, never a value.
 *
 * @param options - `target` to mutate (defaults to `process.env`), the shell to ask (defaults to `$SHELL`), `shellTimeout` in milliseconds and the `fallbackEntries` merged when it cannot answer.
 * @returns Milliseconds the shell took, new PATH entries `added`, variables `applied`, and whether the `fallback` entries were used.
 */
export const loginShellEnvironment = async (
  options: {
    readonly target?: NodeJS.ProcessEnv | undefined;
    readonly shell?: string | undefined;
    readonly shellTimeout?: number | undefined;
    readonly fallbackEntries?: readonly string[] | undefined;
  } = {},
): Promise<{
  readonly added: number;
  readonly applied: number;
  readonly elapsed: number;
  readonly fallback: boolean;
}> => {
  const started = Date.now();
  const target = options.target ?? process.env;
  const current = target['PATH'] ?? '';
  const nothing = { added: 0, applied: 0, elapsed: 0, fallback: false };
  /* Login entries first, then the launcher's, each once. */
  const mergePath = (login: readonly string[]): number => {
    const known = new Set(current.split(':'));
    const merged = [...new Set([...login, ...current.split(':')].filter((entry) => entry !== ''))];
    target['PATH'] = merged.join(':');
    return merged.filter((entry) => !known.has(entry)).length;
  };
  const fallBack = () => ({
    added: mergePath((options.fallbackEntries ?? fallbackPathEntries()).filter((entry) => existsSync(entry))),
    applied: 0,
    elapsed: Date.now() - started,
    fallback: true,
  });
  /* The e2e specs that pin the launcher environment to prove the packaged
   * payload needs nothing from the machine opt out of the whole import. */
  if (process.platform === 'win32' || target['TAU_E2E_KEEP_PATH'] === '1') {
    return nothing;
  }
  const shell = options.shell ?? process.env['SHELL'] ?? '/bin/sh';
  /* The shell gets what its rc files need to find themselves, and nothing of ours. */
  const shellEnvironment: NodeJS.ProcessEnv = {};
  for (const name of ['HOME', 'USER'] as const) {
    const value = process.env[name];
    if (value !== undefined) {
      shellEnvironment[name] = value;
    }
  }
  shellEnvironment['PATH'] = current;
  shellEnvironment['TERM'] = 'dumb';
  let printed: string;
  try {
    /* `env -0` is read by `/bin/sh` from the exported environment, so fish
     * (space-joined `$PATH`) and nushell (no `$` interpolation) answer the same
     * NUL-separated block as bash and zsh. An interactive shell ignores SIGTERM,
     * so the timeout must kill — otherwise an rc file that prompts would hold
     * the boot forever (10-review A). Healthy launches measured 0.96-3.17 s, so
     * the budget leaves headroom for a loaded machine. */
    const { stdout } = await execFileAsync(
      shell,
      ['-ilc', `/bin/sh -c 'printf "\\n${pathSentinel}"; env -0; printf "${pathSentinel}"'`],
      { timeout: options.shellTimeout ?? 5000, killSignal: 'SIGKILL', env: shellEnvironment },
    );
    printed = String(stdout);
  } catch {
    return fallBack();
  }
  /* Rc files may print before the sentinel, and a value may contain newlines;
   * only the block between the first and last sentinel counts. */
  const opened = printed.indexOf(pathSentinel);
  const closed = printed.lastIndexOf(pathSentinel);
  if (opened === -1 || closed === opened) {
    return fallBack();
  }
  let applied = 0;
  let login = '';
  for (const entry of printed.slice(opened + pathSentinel.length, closed).split('\0')) {
    const equals = entry.indexOf('=');
    if (equals < 1) {
      continue;
    }
    const name = entry.slice(0, equals);
    if (name === 'PATH') {
      login = entry.slice(equals + 1);
    } else if (
      !shellBookkeepingNames.has(name) &&
      !shellDeniedPrefixes.some((prefix) => name.startsWith(prefix)) &&
      target[name] === undefined
    ) {
      /* Launcher-set precedence: what started the app already decided. */
      target[name] = entry.slice(equals + 1);
      applied += 1;
    }
  }
  return { added: mergePath(login.split(':')), applied, elapsed: Date.now() - started, fallback: false };
};

/**
 * The only names copied from main's own environment.
 *
 * `PATH` and the temp-directory trio are what Node itself needs; the locale
 * pair keeps kernel output deterministic across shells; `NODE_ENV` selects
 * production builds of the bundled dependencies.
 */
export const utilityEnvironmentNames = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  /* Windows expands `%SystemDrive%` for known folders such as ProgramData, where the Windows sandbox helper keeps its
   * install record; without it `SHGetKnownFolderPath` fails with ERROR_PATH_NOT_FOUND in the fork and its children. */
  'SystemDrive',
  'WINDIR',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  /* Opt-in frame tracing across every Tau process; absent unless the operator sets it. */
  'TAU_ELECTRON_DEBUG',
  /* Opt-in debug logging across main and utility processes. */
  'TAU_DEBUG',
  /* Environment telemetry opt-outs: the services utility's runtime reporter reads them before the config file. */
  'TAU_TELEMETRY',
  'DO_NOT_TRACK',
  'TAU_MACHINES_ENABLED',
  /* Where the person's Bambu Studio lives when it is not at the platform default;
   * the kernel utility slices with it, main reads its presets (blueprint D12). */
  'TAU_BAMBU_STUDIO_PATH',
  /* Where the services utility keeps printer access codes: `keychain` (the macOS
   * default), `file` or `memory`. Automated runs set `file` so they never touch
   * a person's keychain. */
  'TAU_SECRET_VAULT',
] as const;

const allowlistedNames: ReadonlySet<string> = new Set(utilityEnvironmentNames);

/**
 * Build the base environment every utility fork starts from.
 *
 * Windows environment names are case-insensitive, but a copy of `process.env`
 * (main's `desktopEnvironment`) is a plain object that is not. Explorer starts
 * the app with `Path`, `SystemRoot` and `windir`; an MSYS shell (Git Bash, a
 * CI `bash` step) starts it with `PATH`, `SYSTEMROOT` and `WINDIR`. On Windows
 * each allowlisted name is therefore matched without regard to case and
 * written under its allowlisted spelling. A utility without `SystemRoot`
 * cannot initialise Winsock: every socket it opens, loopback included, fails
 * with `connect UNKNOWN`.
 *
 * @param source - Environment to copy from. Defaults to main's own.
 * @param additions - Names this fork additionally needs, merged last.
 * @param platform - The platform whose naming rules apply. Defaults to this one.
 * @returns A fresh environment carrying only allowlisted names.
 */
export const utilityEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  additions: Readonly<Record<string, string>> = {},
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv => {
  const valueOf =
    platform === 'win32'
      ? (() => {
          const byFoldedName = new Map<string, string>();
          for (const [name, value] of Object.entries(source)) {
            const folded = name.toUpperCase();
            /* An exact spelling wins over another case of the same name. */
            if (value !== undefined && (!byFoldedName.has(folded) || allowlistedNames.has(name))) {
              byFoldedName.set(folded, value);
            }
          }
          return (name: string): string | undefined => byFoldedName.get(name.toUpperCase());
        })()
      : (name: string): string | undefined => source[name];
  const environment: NodeJS.ProcessEnv = {};
  for (const name of utilityEnvironmentNames) {
    const value = valueOf(name);
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return Object.assign(environment, additions);
};

/**
 * Point every forked realm's Node compile cache at the app's own data root.
 *
 * Deliberately **not** `NODE_COMPILE_CACHE`, Node's own name for this: in an
 * Electron 43.5.1 utility process that variable is a trap. The bootstrap reads
 * it and marks the cache enabled — a later `module.enableCompileCache()` answers
 * `ALREADY_ENABLED` — and then never writes a single entry (measured: 0 files,
 * versus 166 files / 2.6 MB for the same graph with the variable absent and the
 * directory passed to the call). Setting it would disable the cache it names.
 * So the directory travels under Tau's own name and the fork entries hand it to
 * `enableCompileCache(dir)` explicitly.
 *
 * The directory must be writable and survive across launches, which rules out
 * the signed bundle: `Contents/Resources` is read-only and covered by the code
 * signature, and Node's own fallback (`$TMPDIR`) is purged. The app's data root
 * is the one place that is both.
 *
 * @param userDataPath - Electron's `app.getPath('userData')`.
 * @returns The environment addition every utility fork carries.
 */
export const compileCacheEnvironment = (userDataPath: string): Readonly<{ TAU_COMPILE_CACHE_DIR: string }> => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
  TAU_COMPILE_CACHE_DIR: join(userDataPath, 'compile-cache'),
});

/** The esbuild platform executable each packaged target stages outside the ASAR (`runtime-stage.mts`). */
const stagedEsbuildExecutables: Readonly<Record<string, string>> = {
  'darwin-arm64': '@esbuild/darwin-arm64/bin/esbuild',
  'darwin-x64': '@esbuild/darwin-x64/bin/esbuild',
  'linux-x64': '@esbuild/linux-x64/bin/esbuild',
  'win32-x64': '@esbuild/win32-x64/esbuild.exe',
};

/**
 * Locate esbuild's staged executable for packaged utility processes.
 *
 * Electron can read JavaScript through `app.asar`, but `child_process.spawn`
 * cannot execute the sibling platform binary through that virtual path.
 * Pointing esbuild at the deliberately unpacked payload keeps its normal API
 * fail-closed when that payload is missing.
 *
 * @param packaged - Whether Electron is running an installed application.
 * @param resourcesPath - Electron's application resources directory.
 * @param target - Packaged operating system and CPU architecture.
 * @returns The packaged-only environment addition shared by every utility.
 */
export const packagedEsbuildEnvironment = (
  packaged: boolean,
  resourcesPath: string,
  target?: Readonly<{ architecture: string; platform: NodeJS.Platform }>,
): Readonly<Record<string, string>> => {
  const packagedTarget = target ?? { architecture: process.arch, platform: process.platform };
  const staged = stagedEsbuildExecutables[`${packagedTarget.platform}-${packagedTarget.architecture}`];
  return packaged && staged !== undefined
    ? { [esbuildBinaryPathVariable]: join(resourcesPath, 'app.asar.unpacked/node_modules', staged) }
    : {};
};

/**
 * Point the services utility at the `git` this build ships, when it ships one (OQ3, C68, X2).
 *
 * One binary, not two: the bundled git's own exec path carries `git-lfs`, so
 * `git lfs` resolves through it and nothing has to name a second executable.
 * Absent — a development tree, or a platform whose payload is not built — the
 * toolchain comes from `PATH`, which on a Finder launch is
 * `/usr/bin:/bin:/usr/sbin:/sbin`; a machine that has neither is told once, by
 * name, through `revision.unavailable`.
 *
 * @param resourceRoot - `process.resourcesPath` in a packaged app; `apps/desktop/resources` in a development tree.
 * @param target - Operating system and CPU architecture the payload was prepared for.
 * @returns `TAU_GIT_EXECUTABLE` naming the payload's `git`, or nothing when there is no payload.
 */
export const bundledGitEnvironment = (
  resourceRoot: string,
  target?: Readonly<{ architecture: string; platform: NodeJS.Platform }>,
): Readonly<Record<string, string>> => {
  const { architecture, platform } = target ?? { architecture: process.arch, platform: process.platform };
  const executable = join(
    resourceRoot,
    'git',
    `${platform}-${architecture}`,
    'bin',
    platform === 'win32' ? 'git.exe' : 'git',
  );
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
  return existsSync(executable) ? { TAU_GIT_EXECUTABLE: executable } : {};
};

/**
 * Point the services utility at the store guard this build ships (Linux Terminal git parity blueprint, LP5 and LP8):
 * `resources/store-guard/linux-x64/tau-store-guard`, through which the Linux Terminal writes the project's git store.
 * Absent (another platform, or a development tree where `prepare-store-guard-linux` has not run), the Terminal keeps
 * the store read-only.
 *
 * @param resourceRoot - `process.resourcesPath` in a packaged app; `apps/desktop/resources` in a development tree.
 * @param target - Operating system and CPU architecture the guard was built for.
 * @returns `TAU_DESKTOP_SHELL_STORE_GUARD` naming the guard, or nothing when there is none.
 */
export const bundledStoreGuardEnvironment = (
  resourceRoot: string,
  target?: Readonly<{ architecture: string; platform: NodeJS.Platform }>,
): Readonly<Record<string, string>> => {
  const { architecture, platform } = target ?? { architecture: process.arch, platform: process.platform };
  if (platform !== 'linux') {
    return {};
  }
  const executable = join(resourceRoot, 'store-guard', `${platform}-${architecture}`, 'tau-store-guard');
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
  return existsSync(executable) ? { TAU_DESKTOP_SHELL_STORE_GUARD: executable } : {};
};

/**
 * The Windows shell sandbox for the services utility (desktop Bash/Terminal blueprint Q15, D15): the helper this build
 * ships, `resources/windows-sandbox/win32-x64/tau-windows-sandbox.exe` (`desktop:prepare-windows-sandbox`), as
 * `TAU_WINDOWS_SANDBOX_HELPER`, and the switch that composes the sandbox, `TAU_WINDOWS_SHELL_SANDBOX=1`, when main
 * itself was started with it. The sandbox stays off by default until the WIN-X64 conformance row is green on a merged
 * head; the services host then asks for the helper's one-time elevated setup from the Terminal.
 *
 * The helper path is always the build's own: an inherited `TAU_WINDOWS_SANDBOX_HELPER` is never forwarded, so nothing
 * that launches Tau can choose the executable Tau asks Windows to run elevated. Absent (another platform, or a
 * development tree where `prepare-windows-sandbox` has not run), the services host has no Windows sandbox to compose.
 *
 * @param resourceRoot - `process.resourcesPath` in a packaged app; `apps/desktop/resources` in a development tree.
 * @param source - Main's environment, read for `TAU_WINDOWS_SHELL_SANDBOX` only.
 * @param target - Operating system and CPU architecture the helper was built for.
 * @returns The helper and the switch, each only where it applies.
 */
export const windowsShellSandboxEnvironment = (
  resourceRoot: string,
  source: NodeJS.ProcessEnv = process.env,
  target?: Readonly<{ architecture: string; platform: NodeJS.Platform }>,
): Readonly<Record<string, string>> => {
  const { architecture, platform } = target ?? {
    architecture: process.arch,
    platform: process.platform,
  };
  if (platform !== 'win32') {
    return {};
  }
  const helper = join(resourceRoot, 'windows-sandbox', `${platform}-${architecture}`, 'tau-windows-sandbox.exe');
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
    ...(existsSync(helper) ? { TAU_WINDOWS_SANDBOX_HELPER: helper } : {}),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
    ...(source['TAU_WINDOWS_SHELL_SANDBOX'] === '1' ? { TAU_WINDOWS_SHELL_SANDBOX: '1' } : {}),
  };
};
