import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

/** One row of the host process table. @internal */
export type ProcessRow = Readonly<{ pid: number; ppid: number; pgid: number; zombie: boolean }>;

/**
 * Parse one `/proc/<pid>/stat` line. The command name sits in parentheses and may itself hold spaces or parentheses,
 * so fields are counted from the last `)`.
 */
const parseStat = (pid: number, line: string): ProcessRow | undefined => {
  const close = line.lastIndexOf(')');
  const fields = line.slice(close + 2).split(' ');
  const [state, ppid, pgid] = fields;
  if (close === -1 || state === undefined || ppid === undefined || pgid === undefined) {
    return undefined;
  }
  return { pid, ppid: Number(ppid), pgid: Number(pgid), zombie: state === 'Z' || state === 'X' };
};

const linuxTable = async (): Promise<readonly ProcessRow[]> => {
  const names = await readdir('/proc');
  const rows = await Promise.all(
    names
      .filter((name) => /^\d+$/u.test(name))
      .map(async (name) => {
        try {
          return parseStat(Number(name), await readFile(`/proc/${name}/stat`, 'utf8'));
        } catch {
          /* The process exited between the listing and the read. */
          return undefined;
        }
      }),
  );
  return rows.filter((row) => row !== undefined);
};

const darwinTable = async (): Promise<readonly ProcessRow[]> =>
  new Promise((resolve, reject) => {
    execFile(
      '/bin/ps',
      ['-A', '-o', 'pid=,ppid=,pgid=,stat='],
      { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          stdout
            .split('\n')
            .map((line) => line.trim().split(/\s+/u))
            .filter((fields) => fields.length >= 4)
            .map(([pid, ppid, pgid, stat]) => ({
              pid: Number(pid),
              ppid: Number(ppid),
              pgid: Number(pgid),
              zombie: stat!.startsWith('Z'),
            })),
        );
      },
    );
  });

/**
 * The host process table: `/proc` on Linux, `ps` on macOS.
 *
 * @internal
 * @returns Every visible process.
 */
export const processTable = async (): Promise<readonly ProcessRow[]> =>
  process.platform === 'linux' ? linuxTable() : darwinTable();

/**
 * Every live process descended from `root` by parent links, plus every live member of process group `group`.
 *
 * @internal
 * @param table - A process table.
 * @param root - The tree's root process id.
 * @param group - A process group whose members are also owned.
 * @returns Owned process ids, excluding zombies.
 */
export const ownedProcesses = (table: readonly ProcessRow[], root: number, group: number): ReadonlySet<number> => {
  const children = new Map<number, number[]>();
  for (const row of table) {
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid]);
  }
  const owned = new Set<number>();
  const pending = [root];
  for (let pid = pending.pop(); pid !== undefined; pid = pending.pop()) {
    if (!owned.has(pid)) {
      owned.add(pid);
      pending.push(...(children.get(pid) ?? []));
    }
  }
  for (const row of table) {
    if (row.pgid === group) {
      owned.add(row.pid);
    }
  }
  const zombies = new Set(table.filter((row) => row.zombie).map((row) => row.pid));
  return new Set([...owned].filter((pid) => !zombies.has(pid)));
};

const signal = (pid: number, name: NodeJS.Signals): void => {
  try {
    process.kill(pid, name);
  } catch {
    /* Already gone. */
  }
};

/** Rounds of freezing before the tree is taken as complete; each round only finds processes forked meanwhile. */
const freezeRounds = 16;

/** How often survivors are looked for while waiting for them to stop. */
const pollMilliseconds = 10;

/** @internal */
export type TerminateTreeOptions = Readonly<{
  /** The tree's root, normally the provider's direct child. */
  root: number;
  /** The process group the root leads. */
  group: number;
  /** How long to wait for every owned process to stop. */
  deadlineMilliseconds: number;
  /** The process table reader; injectable for tests. */
  table?: () => Promise<readonly ProcessRow[]>;
}>;

/**
 * Stop every process this launch owns and wait until none is left (I7).
 *
 * The tree is frozen with `SIGSTOP` round by round, so a process cannot fork a new child faster than the walk sees
 * it, then every frozen process and the whole group get `SIGKILL`. On Linux the provider's PID namespace already
 * takes every descendant down with its init; this walk is what proves it. On macOS it is the containment primitive
 * itself, with one disclosed residual (A24 as amended 2026-10-24): a descendant that left both the tree and the group
 * (`setsid` plus a double fork) before termination began is not seen. It stays inside its Seatbelt profile.
 *
 * @internal
 * @param options - The tree, its group and the deadline.
 * @returns Process ids still alive at the deadline; empty when the tree is gone.
 */
export const terminateOwnedProcesses = async (options: TerminateTreeOptions): Promise<readonly number[]> => {
  const read = options.table ?? processTable;
  const frozen = new Set<number>();
  for (let round = 0; round < freezeRounds; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each round must see the processes the previous one froze.
    const owned = ownedProcesses(await read(), options.root, options.group);
    const fresh = [...owned].filter((pid) => !frozen.has(pid));
    if (fresh.length === 0) {
      break;
    }
    for (const pid of fresh) {
      signal(pid, 'SIGSTOP');
      frozen.add(pid);
    }
  }
  for (const pid of frozen) {
    signal(pid, 'SIGKILL');
  }
  signal(-options.group, 'SIGKILL');
  const deadline = Date.now() + options.deadlineMilliseconds;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- polled until the deadline.
    const table = await read();
    const alive = new Set(table.filter((row) => !row.zombie).map((row) => row.pid));
    /* The root is the provider's own child: Node reaps it, so its zombie is not a survivor. */
    const survivors = [...frozen, ...ownedProcesses(table, options.root, options.group)].filter(
      (pid, index, all) => pid !== options.root && alive.has(pid) && all.indexOf(pid) === index,
    );
    if (survivors.length === 0 || Date.now() >= deadline) {
      return survivors;
    }
    for (const pid of survivors) {
      signal(pid, 'SIGKILL');
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
};
