/**
 * PowerShell's module analysis cache, built once per shell and read by every later launch (Windows only).
 *
 * Resolving a cmdlet that is not yet loaded makes PowerShell read, for every module on `PSModulePath`, the commands it
 * exports, from its module analysis cache when an entry is current and by analysing the module otherwise. PowerShell
 * keeps that cache under the sandbox account's `LocalApplicationData`, which resolves inside the launch's private home,
 * new every time, so no launch reuses one. In WIN-X64 run 44014103911 Windows PowerShell 5.1 took 22.5 seconds for a
 * pipeline that resolves `Measure-Object` with Tau's `PSModulePath` and no cache, and 2.0 seconds with this cache.
 *
 * The cache is therefore built by Tau, once per shell digest, in one sandboxed launch that runs no user code and writes
 * it into that launch's own private root. Tau copies the bytes into a file it creates itself in the store, so the
 * sandbox account owns nothing there, and grants the store's folder to every later launch read-only. No launch can
 * write it, so it is never a channel from one session to the next. A launch that finds a module changed since the
 * build analyses that module again and PowerShell's write-back of the cache fails, which it ignores (the WIN-X64 row
 * T02-cache checks that a read-only cache neither errors nor changes); a changed shell digest builds a new cache.
 *
 * The build took 87.5 seconds for Windows PowerShell 5.1 in that run, so it never stands between the person and the
 * shell: the shell is offered uncached, the build runs only while no launch does, a launch stops it, and launches read
 * the cache from the moment it exists ({@link createPowerShellModuleCacheSchedule}).
 *
 * The store is `tau-powershell-cache` in the session directory (the system temporary directory), outside Tau's app data,
 * which every launch denies whole. Clearing it costs one more background build.
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

/**
 * A store layout version, so a change to how the cache is built never reads an older one. v2: Windows PowerShell 5.1
 * builds with its own modules before the machine's on `PSModulePath` (`shellEnvironment`); a v1 cache built inside the
 * AppContainer can lack them, since a machine module folder the sandbox cannot list stopped the build's walk first.
 */
const layout = 'v2';

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

/**
 * Build one cache, stopping when `signal` aborts. Resolves `undefined` for a build that did not produce a cache.
 *
 * @public
 */
export type PowerShellModuleCacheBuild = (signal: AbortSignal) => Promise<PowerShellModuleCache | undefined>;

/**
 * When the cache is built, and which one a launch reads. A build never delays a launch: it starts only while no launch
 * runs, and a launch that arrives during one stops it (and waits only for its sandbox teardown) and runs without the
 * cache; the build starts again once every launch has ended. Windows runs one sandboxed launch at a time, so a build
 * running beside a launch is never an option.
 *
 * @public
 */
export type PowerShellModuleCacheSchedule = Readonly<{
  /** The cache a launch starting now reads, once one is built. */
  current: () => PowerShellModuleCache | undefined;
  /** Allow builds from now on; the host calls it once its startup recovery is done. */
  start: () => void;
  /**
   * Hold off builds for one launch: stop a running build and resolve once it has stopped. Call the answer once the
   * launch has ended, or did not start.
   */
  claim: () => Promise<() => void>;
  /** Resolves once no build is running; for tests and orderly shutdown. */
  settled: () => Promise<void>;
}>;

/** @public */
export type PowerShellModuleCacheScheduleOptions = Readonly<{
  build: PowerShellModuleCacheBuild;
  /** A cache already built, by this host before or by another; nothing is then built. */
  initial?: PowerShellModuleCache | undefined;
  /**
   * How long the shell stays idle before a build starts, so a build does not start between an agent's back-to-back
   * commands only to be stopped by the next one. Milliseconds; ten seconds by default.
   */
  idleDelay?: number | undefined;
  /** Builds that may fail (a stopped one does not count) before this host stops trying; two by default. */
  attempts?: number | undefined;
}>;

/**
 * Schedule the cache's build around the launches that read it ({@link PowerShellModuleCacheSchedule}).
 *
 * @public
 * @param options - The build, a cache already in place, and the idle delay and attempt budget.
 * @returns The schedule.
 */
export const createPowerShellModuleCacheSchedule = (
  options: PowerShellModuleCacheScheduleOptions,
): PowerShellModuleCacheSchedule => {
  const idleDelay = options.idleDelay ?? 10_000;
  const attempts = options.attempts ?? 2;
  const state: {
    current: PowerShellModuleCache | undefined;
    started: boolean;
    active: number;
    failures: number;
    running: Readonly<{ controller: AbortController; done: Promise<void> }> | undefined;
    timer: NodeJS.Timeout | undefined;
  } = { current: options.initial, started: false, active: 0, failures: 0, running: undefined, timer: undefined };
  const wanted = (): boolean =>
    state.started &&
    state.current === undefined &&
    state.running === undefined &&
    state.active === 0 &&
    state.failures < attempts;
  const schedule = (startDelay: number): void => {
    clearTimeout(state.timer);
    state.timer = undefined;
    if (wanted()) {
      // oxlint-disable-next-line no-use-before-define -- `run` schedules again once its build settles.
      state.timer = setTimeout(run, startDelay);
      state.timer.unref();
    }
  };
  const run = (): void => {
    state.timer = undefined;
    if (!wanted()) {
      return;
    }
    const controller = new AbortController();
    const attempt = async (): Promise<void> => {
      /* Yields first, so `running` names this build before the build can settle. */
      await Promise.resolve();
      let built: PowerShellModuleCache | undefined;
      try {
        built = await options.build(controller.signal);
      } catch {
        built = undefined;
      }
      if (built !== undefined) {
        state.current = built;
      } else if (!controller.signal.aborted) {
        state.failures += 1;
      }
      state.running = undefined;
      schedule(idleDelay);
    };
    state.running = { controller, done: attempt() };
  };
  return {
    current: () => state.current,
    start: () => {
      state.started = true;
      schedule(0);
    },
    claim: async () => {
      state.active += 1;
      clearTimeout(state.timer);
      state.timer = undefined;
      const { running } = state;
      if (running !== undefined) {
        running.controller.abort();
        await running.done;
      }
      let released = false;
      return () => {
        if (!released) {
          released = true;
          state.active -= 1;
          schedule(idleDelay);
        }
      };
    },
    settled: async () => {
      await state.running?.done;
    },
  };
};
