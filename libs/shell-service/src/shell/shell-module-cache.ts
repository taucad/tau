/**
 * PowerShell's module analysis cache, built once per shell and read by every later launch (Windows only).
 *
 * Resolving a cmdlet that is not yet loaded makes PowerShell read, for every module on `PSModulePath`, the commands it
 * exports, from its module analysis cache when an entry is current and by analysing the module otherwise. A launch's
 * private home is new every time and the sandbox account runs without its profile, so no launch finds a cache it can
 * keep: in WIN-X64 run 44009882001 Windows PowerShell 5.1, whose own module folder holds dozens of modules, took 18 to
 * 26 seconds for each command that resolved a cmdlet and 0.3 seconds for `exit 7`, which resolves none.
 *
 * The cache is therefore built by Tau, once per shell digest, in one sandboxed launch that runs no user code and writes
 * it into that launch's own private root. Tau copies the bytes into a file it creates itself in the store, so the
 * sandbox account owns nothing there, and grants the store's folder to every later launch read-only. No launch can
 * write it, so it is never a channel from one session to the next. A launch that finds a module changed since the
 * build analyses that module again and PowerShell's write-back of the cache fails, which it ignores (the WIN-X64 row
 * T02-cache checks that a read-only cache neither errors nor changes); a changed shell digest builds a new cache.
 *
 * The store is `tau-powershell-cache` in the session directory (the system temporary directory), outside Tau's app data
 * because the build's own writable roots may not lie in a denied path. Clearing it costs one more build at the next
 * probe.
 *
 * @module
 */
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { powerShellModuleCacheFile } from '@taucad/sandbox/shell/identity';
import type { ShellExecutable } from '@taucad/sandbox/shell/identity';

/**
 * One shell's built cache: the folder every launch is granted read-only, and the file PowerShell is pointed at.
 *
 * @public
 */
export type PowerShellModuleCache = Readonly<{
  directory: string;
  file: string;
}>;

/** The store's folder name under the session directory; never `tau-shell-*`, which names private roots. */
export const powerShellModuleCacheStore = 'tau-powershell-cache';

/** The largest cache Tau keeps: a bound on what a build launch can make Tau read, far above any real cache. */
const maximumBytes = 64 * 1024 * 1024;

/** A store layout version, so a change to how the cache is built never reads an older one. */
const layout = 'v1';

/**
 * Where one shell's cache lives in the store: a folder named for the layout and the shell's digest.
 *
 * @public
 * @param store - The store folder.
 * @param executable - The shell.
 * @returns The cache's folder and file.
 */
export const powerShellModuleCacheLocation = (store: string, executable: ShellExecutable): PowerShellModuleCache => {
  const directory = join(store, `${layout}-${executable.digest.replace(/^sha256:/u, '')}`);
  return { directory, file: join(directory, powerShellModuleCacheFile) };
};

/** A plain file of a plausible size with one name: not a link, not a hard link to some other file. */
const plainFile = async (path: string): Promise<boolean> => {
  try {
    const status = await lstat(path);
    return status.isFile() && status.nlink === 1 && status.size > 0 && status.size <= maximumBytes;
  } catch {
    return false;
  }
};

/**
 * Whether a built cache is in place: its folder a real folder and its file a plain file.
 *
 * @public
 * @param cache - The cache's location.
 * @returns `true` when the cache can be granted as it is.
 */
export const builtPowerShellModuleCache = async (cache: PowerShellModuleCache): Promise<boolean> => {
  try {
    const folder = await lstat(cache.directory);
    return folder.isDirectory() && (await plainFile(cache.file));
  } catch {
    return false;
  }
};

/**
 * Copy the cache a build launch wrote into the store, as a new file Tau creates in a new folder that is renamed into
 * place whole. The written file must be a plain file: its launch has ended, so nothing replaces it while it is read.
 *
 * @public
 * @param written - The file the build launch wrote, inside its private root.
 * @param cache - Where the cache belongs.
 * @returns `true` once the cache is in place, including when another build put it there first.
 */
export const adoptPowerShellModuleCache = async (written: string, cache: PowerShellModuleCache): Promise<boolean> => {
  if (!(await plainFile(written))) {
    return false;
  }
  const bytes = await readFile(written);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    return false;
  }
  const store = dirname(cache.directory);
  await mkdir(store, { recursive: true });
  const staging = await mkdtemp(join(store, `${basename(cache.directory)}.`));
  try {
    await writeFile(join(staging, basename(cache.file)), bytes, { flag: 'wx' });
    /* A folder left without its file (an interrupted copy) is replaced; a complete one is kept. */
    if (!(await builtPowerShellModuleCache(cache))) {
      await rm(cache.directory, { recursive: true, force: true });
    }
    await rename(staging, cache.directory);
    return true;
  } catch {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return builtPowerShellModuleCache(cache);
  }
};
