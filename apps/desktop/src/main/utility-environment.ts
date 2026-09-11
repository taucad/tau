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
import { join } from 'node:path';
import { promisify } from 'node:util';

const esbuildBinaryPathVariable = 'ESBUILD_BINARY_PATH';
const execFileAsync = promisify(execFile);
const pathSentinel = '__TAU_PATH__';

/** Per-shell bookkeeping that describes the probe, not the user's environment. */
const shellBookkeepingNames = new Set(['SHLVL', 'PWD', 'OLDPWD', '_', 'TERM', 'PATH']);

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
 * where the launcher set none, and shell bookkeeping is dropped.
 *
 * Values from rc files can be secrets; log the names and counts, never a value.
 *
 * @param options - `target` to mutate (defaults to `process.env`), the shell to ask (defaults to `$SHELL`) and `shellTimeout` in milliseconds.
 * @returns Milliseconds the shell took, new PATH entries `added`, and variables `applied`.
 */
export const loginShellEnvironment = async (
  options: {
    readonly target?: NodeJS.ProcessEnv | undefined;
    readonly shell?: string | undefined;
    readonly shellTimeout?: number | undefined;
  } = {},
): Promise<{ readonly added: number; readonly applied: number; readonly elapsed: number }> => {
  const started = Date.now();
  const target = options.target ?? process.env;
  const current = target['PATH'] ?? '';
  const nothing = { added: 0, applied: 0, elapsed: 0 };
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
     * the boot forever (10-review A). */
    const { stdout } = await execFileAsync(
      shell,
      ['-ilc', `/bin/sh -c 'printf "\\n${pathSentinel}"; env -0; printf "${pathSentinel}"'`],
      { timeout: options.shellTimeout ?? 3000, killSignal: 'SIGKILL', env: shellEnvironment },
    );
    printed = String(stdout);
  } catch {
    return { ...nothing, elapsed: Date.now() - started };
  }
  /* Rc files may print before the sentinel, and a value may contain newlines;
   * only the block between the first and last sentinel counts. */
  const opened = printed.indexOf(pathSentinel);
  const closed = printed.lastIndexOf(pathSentinel);
  if (opened === -1 || closed === opened) {
    return { ...nothing, elapsed: Date.now() - started };
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
    } else if (!shellBookkeepingNames.has(name) && target[name] === undefined) {
      /* Launcher-set precedence: what started the app already decided. */
      target[name] = entry.slice(equals + 1);
      applied += 1;
    }
  }
  const known = new Set(current.split(':'));
  const entries = [...login.split(':'), ...current.split(':')].filter((entry) => entry !== '');
  const merged = [...new Set(entries)];
  target['PATH'] = merged.join(':');
  return { added: merged.filter((entry) => !known.has(entry)).length, applied, elapsed: Date.now() - started };
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
  'WINDIR',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  /* Opt-in frame tracing across every Tau process; absent unless the operator sets it. */
  'TAU_ELECTRON_DEBUG',
  /* Opt-in debug logging across main and utility processes. */
  'TAU_DEBUG',
  'TAU_BUILD123D_RESOURCE_ROOT',
  'TAU_PICOGK_RESOURCE_ROOT',
] as const;

/**
 * Build the base environment every utility fork starts from.
 *
 * @param source - Environment to copy from. Defaults to main's own.
 * @param additions - Names this fork additionally needs, merged last.
 * @returns A fresh environment carrying only allowlisted names.
 */
export const utilityEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  additions: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of utilityEnvironmentNames) {
    const value = source[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return Object.assign(environment, additions);
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
  return packaged && packagedTarget.platform === 'darwin' && packagedTarget.architecture === 'arm64'
    ? {
        [esbuildBinaryPathVariable]: join(
          resourcesPath,
          'app.asar.unpacked/node_modules/@esbuild/darwin-arm64/bin/esbuild',
        ),
      }
    : {};
};
