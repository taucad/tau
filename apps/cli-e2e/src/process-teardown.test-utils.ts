/**
 * Bounded teardown for the CLI end-to-end suites: stopping a spawned `tau` process together with every process it
 * started, and removing a directory too large to remove inside a hook.
 *
 * A daemon's graceful stop is not bounded by anything a test controls: `tau serve` gives each runtime child a 5 s close
 * grace and then a 5 s `SIGTERM` grace, closes its project and removes the child's directory, so a test that waits for
 * it can spend more than vitest's 10 s hook timeout. Nothing a teardown asserts needs that stop to be graceful, so
 * {@link stopProcessTree} offers it a short grace and then kills the whole tree, the native workers that lead process
 * groups of their own included, and is bounded by {@link processTreeStopLimit}.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Milliseconds {@link stopProcessTree} lets a process stop on `SIGTERM` before it kills the tree. */
export const processTreeStopGrace = 5000;

/** Milliseconds a `SIGKILL`ed tree may take to be gone: the kernel reaps it within moments. */
const killSettleLimit = 2000;

/** Milliseconds allowed for the two `ps` snapshots {@link stopProcessTree} takes. */
const snapshotLimit = 2000;

/**
 * The most milliseconds {@link stopProcessTree} takes with the default grace: the grace, two `ps` snapshots and the
 * settle after `SIGKILL`. A hook that stops a tree and then closes in-process servers sets its timeout from this.
 */
export const processTreeStopLimit = processTreeStopGrace + snapshotLimit + killSettleLimit;

/**
 * Every process below `pid`, from one `ps` snapshot (POSIX `-A -o`, so Linux and macOS alike). A native worker that
 * leads its own process group is still a child of the process that spawned it, so it is found here.
 *
 * @param pid - The root process.
 * @returns The descendants' pids; none when `ps` cannot answer in time.
 */
export const descendantsOf = async (pid: number): Promise<number[]> => {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=,ppid='], { timeout: snapshotLimit / 2 }));
  } catch {
    return [];
  }
  const childrenOf = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const [child, parent] = line.trim().split(/\s+/u).map(Number);
    if (child !== undefined && parent !== undefined && Number.isInteger(child) && Number.isInteger(parent)) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
    }
  }
  const found: number[] = [];
  const pending = [pid];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const child of childrenOf.get(next) ?? []) {
      found.push(child);
      pending.push(child);
    }
  }
  return found;
};

/**
 * Whether `pid` still runs. A zombie counts as exited: it holds no files, and a parent that never reaps it would keep
 * it forever.
 *
 * @param pid - The process.
 * @returns `true` while it runs.
 */
export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' })
      .trim()
      .startsWith('Z');
  } catch {
    /* `ps` exits non-zero once the process is gone. */
    return false;
  }
};

const killQuietly = (pid: number): void => {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Exited between the check and the signal.
  }
};

/**
 * Wait until none of `pids` runs, or `limit` milliseconds pass.
 *
 * @param pids - The processes.
 * @param limit - Milliseconds to wait at most.
 * @returns Those still running at the deadline.
 */
const awaitGone = async (pids: readonly number[], limit: number): Promise<number[]> => {
  const deadline = performance.now() + limit;
  let alive = pids.filter((pid) => isAlive(pid));
  while (alive.length > 0 && performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling: each round waits before re-reading liveness.
    await sleep(25);
    alive = alive.filter((pid) => isAlive(pid));
  }
  return alive;
};

/**
 * Wait for processes a stopped daemon left running, `SIGKILL`ing any still alive at the deadline. A daemon stopped
 * before its runtime child exits orphans it, and the orphan (whose tsx loader writes its cache under the config
 * directory's `runtime-children/…/tmp`) would otherwise race the directory's removal into `ENOTEMPTY`.
 *
 * @param pids - The processes to wait for.
 * @param grace - Milliseconds to wait before `SIGKILL`ing the survivors.
 */
export const reap = async (pids: readonly number[], grace: number): Promise<void> => {
  const alive = await awaitGone(pids, grace);
  for (const pid of alive) {
    killQuietly(pid);
  }
  await awaitGone(alive, killSettleLimit);
};

/** How {@link stopProcessTree} stopped a tree. */
export type ProcessTreeStop = {
  /** Whether the root exited on `SIGTERM` within the grace. */
  readonly graceful: boolean;
  /** Milliseconds the stop took. */
  readonly elapsed: number;
  /** Descendants still running after the settle; none unless the kernel could not reap a `SIGKILL`ed process. */
  readonly survivors: readonly number[];
};

/**
 * Stop `child` and every process below it within {@link processTreeStopLimit}: `SIGTERM`, `grace` milliseconds for
 * the root to exit, then `SIGKILL` for the root and every descendant still running. The descendants are read before
 * the signal (once the root is gone they are re-parented and no longer found below it) and again before the kill, so a
 * process started during the stop is killed too. A descendant left behind by a root that did exit gracefully is an
 * orphan nothing will stop, so it is killed at once.
 *
 * @param child - The process to stop.
 * @param grace - Milliseconds the root may take to exit on `SIGTERM`; `0` kills the tree at once.
 * @returns How the tree stopped.
 */
export const stopProcessTree = async (child: ChildProcess, grace = processTreeStopGrace): Promise<ProcessTreeStop> => {
  const started = performance.now();
  const exitedAlready = (): boolean => child.exitCode !== null || child.signalCode !== null;
  if (child.pid === undefined || exitedAlready()) {
    return { graceful: true, elapsed: 0, survivors: [] };
  }
  const rootPid = child.pid;
  const exited = new Promise<true>((resolve) => {
    child.once('exit', () => {
      resolve(true);
    });
  });
  const tree = new Set(await descendantsOf(rootPid));
  let graceful = false;
  if (grace > 0 && !exitedAlready()) {
    child.kill('SIGTERM');
    graceful = await Promise.race([exited, sleep(grace, false)]);
  }
  graceful ||= exitedAlready();
  if (!graceful) {
    for (const pid of await descendantsOf(rootPid)) {
      tree.add(pid);
    }
    child.kill('SIGKILL');
  }
  const descendants = [...tree];
  for (const pid of descendants) {
    if (isAlive(pid)) {
      killQuietly(pid);
    }
  }
  const [, survivors] = await Promise.all([
    Promise.race([exited, sleep(killSettleLimit)]),
    awaitGone(descendants, killSettleLimit),
  ]);
  return { graceful, elapsed: Math.round(performance.now() - started), survivors };
};

/**
 * Remove a directory without waiting for it: a detached `rm -rf` that outlives the hook and the test process.
 *
 * For a directory whose removal is not bounded by anything the hook knows, such as a prepared dependency store of about
 * 1 GB in tens of thousands of files, which on a macOS runner can take longer than vitest's 10 s hook timeout. The path
 * must be one no later test reuses (a `mkdtemp` directory). Windows removes it in place, as it cannot unlink a file a
 * process still holds.
 *
 * @param path - The directory; nothing when empty.
 */
export const removeInBackground = async (path: string): Promise<void> => {
  if (path === '') {
    return;
  }
  if (process.platform === 'win32') {
    await rm(path, { recursive: true, force: true });
    return;
  }
  const remover = spawn('rm', ['-rf', path], { detached: true, stdio: 'ignore' });
  /* A remover that cannot start leaves a temporary directory to the OS; it is not the test's failure. */
  remover.once('error', () => undefined);
  remover.unref();
};
