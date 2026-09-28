/**
 * Discovery of the person's own Bambu Studio install.
 *
 * Tau ships none of Bambu Studio; it looks for the app where the platform
 * installs it, or where `TAU_BAMBU_STUDIO_PATH` points.
 *
 * @module
 */

import { execFile } from 'node:child_process';
import { access, constants, mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import type { BambuStudioInstallation } from '#bambu-studio/types.js';

/** Milliseconds `--help` may take before the install counts as broken. */
const versionProbeTimeout = 30_000;

// Version probes per executable, keyed by its modification time; concurrent callers share one probe.
const versionCache = new Map<string, Readonly<{ modified: number; version: Promise<string | undefined> }>>();

const exists = async (path: string, mode = constants.F_OK): Promise<boolean> => {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
};

// The version is `02.08.02.61` in `BambuStudio-02.08.02.61:`, the first line of `--help` output.
const probeVersion = async (executable: string): Promise<string | undefined> => {
  // `--help` writes `result.json` into its working directory, so it runs in a temporary one.
  const cwd = await mkdtemp(join(tmpdir(), 'tau-bambu-studio-version-'));
  const output = await new Promise<string | undefined>((resolve) => {
    execFile(
      executable,
      ['--help'],
      { cwd, timeout: versionProbeTimeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        // `--help` may exit non-zero; its output still names the version.
        resolve(typeof stdout === 'string' && stdout !== '' ? stdout : error ? undefined : '');
      },
    );
  }).finally(async () => rm(cwd, { recursive: true, force: true }));
  return output === undefined ? undefined : (/^BambuStudio-([\d.]+):/mu.exec(output)?.[1] ?? 'unknown');
};

const readVersion = async (executable: string): Promise<string | undefined> => {
  const { mtimeMs } = await stat(executable);
  const cached = versionCache.get(executable);
  if (cached?.modified === mtimeMs) {
    return cached.version;
  }
  const version = probeVersion(executable);
  versionCache.set(executable, { modified: mtimeMs, version });
  // A failed probe is not remembered, so a repaired install is found on the next call.
  if ((await version) === undefined) {
    versionCache.delete(executable);
  }
  return version;
};

// Executable and resources directory for a macOS app bundle, a bundle executable or a plain executable.
const layoutOf = async (path: string): Promise<{ executable: string; resourcesDir: string } | undefined> => {
  if (path.endsWith('.app') || (await exists(join(path, 'Contents', 'MacOS')))) {
    return {
      executable: join(path, 'Contents', 'MacOS', 'BambuStudio'),
      resourcesDir: join(path, 'Contents', 'Resources'),
    };
  }
  const directory = dirname(path);
  // A macOS bundle executable, a Windows install directory or a Linux prefix install.
  for (const resourcesDirectory of [
    join(directory, '..', 'Resources'),
    join(directory, 'resources'),
    join(directory, '..', 'share', 'BambuStudio'),
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- first match wins
    if (await exists(join(resourcesDirectory, 'profiles'))) {
      return { executable: path, resourcesDir: resourcesDirectory };
    }
  }
  return undefined;
};

const candidates = (env: NodeJS.ProcessEnv, home: string): string[] => {
  if (process.platform === 'darwin') {
    return ['/Applications/BambuStudio.app', join(home, 'Applications', 'BambuStudio.app')];
  }
  if (process.platform === 'win32') {
    return [join(env['ProgramFiles'] ?? String.raw`C:\Program Files`, 'Bambu Studio', 'bambu-studio.exe')];
  }
  return (env['PATH'] ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, 'bambu-studio'));
};

const dataDirectoryOf = (env: NodeJS.ProcessEnv, home: string): string =>
  process.platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'BambuStudio')
    : process.platform === 'win32'
      ? join(env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'BambuStudio')
      : join(env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'BambuStudio');

/**
 * Find the person's Bambu Studio install.
 *
 * Checks `TAU_BAMBU_STUDIO_PATH` (an app bundle or executable) first, then
 * the platform default: `/Applications/BambuStudio.app` or
 * `~/Applications/BambuStudio.app` on macOS,
 * `%ProgramFiles%\Bambu Studio\bambu-studio.exe` on Windows, `bambu-studio`
 * on `PATH` elsewhere. The version comes from `--help` and is cached until
 * the executable changes.
 *
 * @param options - `env` replaces `process.env` for the lookup.
 * @returns The install, or `undefined` when none is usable.
 * @public
 * @example <caption>Report the installed version</caption>
 * ```typescript
 * import { findBambuStudio } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * const label = install ? `Bambu Studio ${install.version}` : 'Bambu Studio not installed';
 * ```
 */
export const findBambuStudio = async (
  options: Readonly<{ env?: NodeJS.ProcessEnv }> = {},
): Promise<BambuStudioInstallation | undefined> => {
  const env = options.env ?? process.env;
  const home = env['HOME'] ?? env['USERPROFILE'] ?? homedir();
  const override = env['TAU_BAMBU_STUDIO_PATH'];
  for (const candidate of override ? [override] : candidates(env, home)) {
    // oxlint-disable-next-line no-await-in-loop -- first usable install wins
    const layout = await layoutOf(candidate);
    // oxlint-disable-next-line no-await-in-loop -- same
    if (layout === undefined || !(await exists(layout.executable, constants.X_OK))) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- same
    const version = await readVersion(layout.executable);
    if (version === undefined) {
      continue;
    }
    const dataDirectory = dataDirectoryOf(env, home);
    // oxlint-disable-next-line no-await-in-loop -- same
    return { ...layout, version, ...((await exists(dataDirectory)) ? { dataDir: dataDirectory } : {}) };
  }
  return undefined;
};
