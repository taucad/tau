import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

/** One row of the host process table. @public */
export type ProcessRow = Readonly<{
  pid: number;
  ppid: number;
  pgid: number;
  zombie: boolean;
  /** Process creation identity, used to discard retained ownership after PID reuse. */
  started?: string;
}>;

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
  return { pid, ppid: Number(ppid), pgid: Number(pgid), zombie: state === 'Z' || state === 'X', started: fields[19] };
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

/** Maximum duration of a process-table snapshot. Milliseconds. */
const tableTimeout = 1000;

const darwinTable = async (): Promise<readonly ProcessRow[]> =>
  new Promise((resolve, reject) => {
    execFile(
      '/bin/ps',
      ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart='],
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
        maxBuffer: 16 * 1024 * 1024,
        timeout: tableTimeout,
        killSignal: 'SIGKILL',
      },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`ps failed: ${error.message}`, { cause: error }));
          return;
        }
        resolve(
          stdout
            .split('\n')
            .map((line) => line.trim().split(/\s+/u))
            .filter((fields) => fields.length >= 4)
            .map(([pid, ppid, pgid, stat, ...started]) => ({
              pid: Number(pid),
              ppid: Number(ppid),
              pgid: Number(pgid),
              zombie: stat!.startsWith('Z'),
              started: started.join(' '),
            })),
        );
      },
    );
  });

/**
 * Share one read among concurrent callers without handing anyone a stale answer.
 *
 * A caller that arrives while a read is running waits for the next read, which starts only after the running one
 * ends, so every answer was taken after its caller asked; everyone waiting meanwhile shares that next read. At most
 * one read runs at a time.
 *
 * @public
 * @param read - The read to share.
 * @returns The shared read.
 */
export const coalesceReads = <T>(read: () => Promise<T>): (() => Promise<T>) => {
  let running: Promise<T> | undefined;
  let next: Promise<T> | undefined;
  const start = async (): Promise<T> => {
    const current = read();
    running = current;
    try {
      return await current;
    } finally {
      /* A queued read keeps this one marked as running until it starts, so no caller slips in a second read. */
      if (running === current && next === undefined) {
        running = undefined;
      }
    }
  };
  const after = async (previous: Promise<T>): Promise<T> => {
    try {
      await previous;
    } catch {
      /* The next read stands on its own; a failed one is never handed to anyone else. */
    }
    next = undefined;
    return start();
  };
  return async () => {
    if (running === undefined) {
      return start();
    }
    next ??= after(running);
    return next;
  };
};

/*
 * Every launch on macOS tracks its tree every 250 ms, and eight launches at once spawned dozens of `ps` per second:
 * on a loaded runner single reads then outran their bound and cleanup went unconfirmed (MAC-X T02, S04). One `ps`
 * per process at a time serves them all.
 */
const sharedDarwinTable = coalesceReads(darwinTable);

/**
 * The host process table: `/proc` on Linux, `ps` on macOS.
 *
 * @public
 * @returns Every visible process.
 */
export const processTable = async (): Promise<readonly ProcessRow[]> =>
  process.platform === 'linux' ? linuxTable() : sharedDarwinTable();

/**
 * Every live process descended from `root` by parent links, plus every live member of process group `group`.
 *
 * @public
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

/** @public */
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
 * A failed or hung observation is uncertainty, never an empty process table.
 *
 * @param read - The observation being bounded.
 * @param observationTimeout - Remaining observation budget. Milliseconds.
 * @returns The observed rows, or a rejection when observation cannot be confirmed.
 */
const boundedTable = async (
  read: () => Promise<readonly ProcessRow[]>,
  observationTimeout: number,
): Promise<readonly ProcessRow[]> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            reject(new Error('Process-table observation timed out; process termination is unconfirmed.'));
          },
          Math.max(1, observationTimeout),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Stop every process this launch owns and wait until none is left (I7).
 *
 * The tree is frozen with `SIGSTOP` round by round, so a process cannot fork a new child faster than the walk sees
 * it, then every frozen process and the whole group get `SIGKILL`. On Linux the provider's PID namespace already
 * takes every descendant down with its init; this walk is what proves it. On macOS it is the containment primitive
 * itself, with one disclosed residual (A24 as amended 2026-10-24): a descendant that left both the tree and the group
 * (`setsid` plus a double fork) before termination began is not seen. It stays inside its Seatbelt profile.
 *
 * @public
 * @param options - The tree, its group and the deadline.
 * @returns Process ids still alive at the deadline; empty when the tree is gone.
 */
export const terminateOwnedProcesses = async (options: TerminateTreeOptions): Promise<readonly number[]> => {
  /* A launch that never started has no tree; signalling group 1 or -1 would reach unrelated processes. */
  if (!Number.isInteger(options.root) || options.root <= 1 || !Number.isInteger(options.group) || options.group <= 1) {
    return [];
  }
  const deadline = Date.now() + options.deadlineMilliseconds;
  const read = async (): Promise<readonly ProcessRow[]> =>
    boundedTable(options.table ?? processTable, Math.min(tableTimeout, Math.max(1, deadline - Date.now())));
  const frozen = new Set<number>();
  try {
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
  } finally {
    /* A failed table read must not leave processes frozen without terminating them. */
    for (const pid of frozen) {
      signal(pid, 'SIGKILL');
    }
    signal(-options.group, 'SIGKILL');
  }
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- polled until the deadline.
    const table = await read();
    const alive = new Set(table.filter((row) => !row.zombie).map((row) => row.pid));
    /* Every live writer counts, including the root. Zombie rows are already excluded above. */
    const survivors = [...frozen, ...ownedProcesses(table, options.root, options.group)].filter(
      (pid, index, all) => alive.has(pid) && all.indexOf(pid) === index,
    );
    if (survivors.length === 0 || Date.now() >= deadline) {
      return survivors;
    }
    for (const pid of survivors) {
      signal(pid, 'SIGKILL');
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await new Promise((resolve) => {
      setTimeout(resolve, pollMilliseconds);
    });
  }
};

/** How often a surviving launch owner remembers the macOS process tree. */
const trackingMilliseconds = 250;

/**
 * Descendant tracking on macOS: every process ever seen in the tree is remembered with its group, so a job that moves
 * to its own process group (interactive job control) and is reparented when the shell exits is still terminated.
 *
 * @public
 * @param root - The launch process whose descendants this owner retains.
 * @param read - The process table reader; injectable for identity regression tests.
 * @returns A process table retaining observed descendants and an explicit polling disposer.
 */
export const trackDescendants = (
  root: number,
  read: () => Promise<readonly ProcessRow[]> = processTable,
): { stop: () => Promise<void>; table: () => Promise<readonly ProcessRow[]> } => {
  const seen = new Map<number, Readonly<{ pgid: number; started: string }>>();
  const remember = async (): Promise<readonly ProcessRow[]> => {
    const rows = await boundedTable(read, tableTimeout);
    for (const [pid, identity] of seen) {
      if (!rows.some((row) => row.pid === pid && row.pgid === identity.pgid && row.started === identity.started)) {
        seen.delete(pid);
      }
    }
    const tree = new Set([root, ...seen.keys()]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (!tree.has(row.pid) && tree.has(row.ppid)) {
          tree.add(row.pid);
          if (row.started !== undefined && row.started.length > 0) {
            seen.set(row.pid, { pgid: row.pgid, started: row.started });
          }
          grew = true;
        }
      }
    }
    /* A remembered process still owned shows up as a child of the root, whatever its parent is now. */
    return rows.map((row) => (seen.has(row.pid) ? { ...row, ppid: root } : row));
  };
  let polling = false;
  const poll = async (): Promise<void> => {
    try {
      await remember();
    } catch {
      /* A failed poll is retried on the next tick; termination takes a fresh table of its own. */
    } finally {
      polling = false;
    }
  };
  let latest: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    if (!polling) {
      polling = true;
      latest = poll();
    }
  }, trackingMilliseconds);
  timer.unref();
  return {
    stop: async () => {
      clearInterval(timer);
      await latest;
    },
    table: remember,
  };
};
