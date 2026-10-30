import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { z } from 'zod';

import { processTable, terminateOwnedProcesses } from '#shell/process-tree.js';
import type { ProcessRow } from '#shell/process-tree.js';
import type { PreparedShell, ShellExecution, ShellRecovery, ShellResource } from '#shell/shell-provider.js';

/** One execution's kernel lock. Only the credential-free supervisor inherits its descriptor. */
export type CustodyLock = Readonly<{
  descriptor: number;
  assertCurrent: () => Promise<void>;
  handoff: () => Promise<void>;
  release: () => Promise<void>;
}>;

/**
 * Acquire an exclusive open-description lock; the acquisition utility never receives a command to execute.
 *
 * @param input - Existing configured custody directory and an unpredictable execution identity.
 * @returns A retained descriptor, fenced locally when handed to the supervisor or released.
 */
export const acquireCustodyLock = async (
  input: Readonly<{ directory: string; executionId: string }>,
): Promise<CustodyLock> => {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(input.executionId)) {
    throw new Error('Invalid shell custody execution identity.');
  }
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error('Native shell custody locking is unavailable on this platform.');
  }
  const directory = await realpath(input.directory);
  const path = join(directory, `${input.executionId}.lock`);
  const descriptor = await open(path, constants.O_CREAT + constants.O_RDWR + constants.O_NOFOLLOW, 0o600);
  try {
    const identity = await descriptor.stat({ bigint: true });
    const uid = process.getuid?.();
    if (!identity.isFile() || identity.nlink !== 1n || uid === undefined || identity.uid !== BigInt(uid)) {
      throw new Error('Shell custody lock is not an owned regular file.');
    }
    const command = process.platform === 'linux' ? '/usr/bin/flock' : '/usr/bin/perl';
    const arguments_ =
      process.platform === 'linux'
        ? ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3']
        : ['-e', 'open my $lock, "<&=3" or die $!; flock($lock, 6) or exit 75;'];
    // BSD flock, unlike POSIX lockf, is retained by the shared open-file description.
    // macOS must qualify this capability; an absent or failed system Perl refuses acquisition.
    const child = spawn(command, arguments_, {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- native environment names.
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      stdio: ['ignore', 'ignore', 'pipe', descriptor.fd],
    });
    const completion = Promise.withResolvers<number | undefined>();
    let diagnostics = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      diagnostics += chunk.slice(0, Math.max(0, 4096 - diagnostics.length));
    });
    child.once('error', completion.reject);
    child.once('close', (code) => {
      completion.resolve(code ?? undefined);
    });
    const acquisition = { timedOut: false };
    const timer = setTimeout(() => {
      acquisition.timedOut = true;
      child.kill('SIGKILL');
    }, 2000);
    let code: number | undefined;
    try {
      code = await completion.promise;
    } finally {
      clearTimeout(timer);
    }
    if (acquisition.timedOut) {
      throw new Error('Shell custody lock acquisition timed out.');
    }
    if (code === 75) {
      throw new Error('Shell execution is already owned.');
    }
    if (code !== 0) {
      throw new Error(`Shell custody lock acquisition failed: ${diagnostics.trim()}`);
    }
    const ownership = { current: true };
    const isCurrent = (): boolean => ownership.current;
    let closing: Promise<void> | undefined;
    const close = async (): Promise<void> => {
      ownership.current = false;
      closing ??= descriptor.close();
      await closing;
    };
    const assertCurrent = async (): Promise<void> => {
      if (!isCurrent()) {
        throw new Error('Shell custody ownership is no longer current.');
      }
      const visible = await lstat(path, { bigint: true });
      if (!isCurrent() || !visible.isFile() || visible.dev !== identity.dev || visible.ino !== identity.ino) {
        throw new Error('Shell custody ownership is no longer current.');
      }
    };
    return { descriptor: descriptor.fd, assertCurrent, handoff: close, release: close };
  } catch (error) {
    await descriptor.close();
    throw error;
  }
};

const physicalIdentity = z.strictObject({ device: z.string(), inode: z.string() });
const processIdentity = z.strictObject({ pid: z.number().int().min(2), started: z.string().min(1) });
const recordSchema = z.strictObject({
  version: z.literal(1),
  executionId: z.uuid(),
  phase: z.enum(['prepared', 'armed', 'stopped']),
  privateRoot: z.string().min(1),
  privateIdentity: physicalIdentity,
  resource: z.strictObject({ key: z.string().min(1), root: z.string().min(1) }).optional(),
  resourceIdentity: physicalIdentity.optional(),
  boot: z.string().min(1),
  owner: processIdentity.extend({ token: z.uuid() }),
  supervisor: processIdentity.optional(),
  root: processIdentity.optional(),
  descendants: z.array(processIdentity),
});
type CustodyRecord = z.infer<typeof recordSchema>;
type HeldCustody = Readonly<{ lock: CustodyLock; token: string }>;

/** The supervisor and staged root of one launch, registered before its start barrier opens. */
export type ShellRegistration = PreparedShell & Readonly<{ supervisor: number; root: number }>;

/** Existing native custody owner; a stopped recovery keeps its lock until release or close. */
export type ShellCustody = Readonly<{
  prepare: (input: Readonly<{ privateRoot: string; resource: ShellResource | undefined }>) => Promise<PreparedShell>;
  /** The prepared lock's descriptor, inherited only by the launch's supervisor when it is spawned. */
  descriptor: (executionId: string) => number;
  /** Durably arm a prepared execution with the creation identities of its supervisor and still-blocked root. */
  register: (input: ShellRegistration) => Promise<void>;
  /** Fence this owner after the supervisor holds the inherited lock; the supervisor's exit releases it. */
  handoff: (executionId: string) => Promise<void>;
  inventory: () => Promise<readonly ShellExecution[]>;
  recover: (input: Readonly<{ executionIds: readonly string[] }>) => Promise<readonly ShellRecovery[]>;
  release: (input: PreparedShell) => Promise<void>;
  close: () => Promise<void>;
}>;

/** How long armed recovery may spend terminating and confirming registered identities. Milliseconds. */
const recoveryMilliseconds = 5000;

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const metadata = (record: CustodyRecord): ShellExecution => ({
  executionId: record.executionId,
  privateRoot: record.privateRoot,
  resource: record.resource,
});
const identityOf = async (path: string): Promise<z.infer<typeof physicalIdentity>> => {
  const stats = await lstat(path, { bigint: true });
  const uid = process.getuid?.();
  if (!stats.isDirectory() || uid === undefined || stats.uid !== BigInt(uid)) {
    throw new Error('Shell custody root must be an owned physical directory.');
  }
  return { device: String(stats.dev), inode: String(stats.ino) };
};
const bootIdentity = async (): Promise<string> => {
  if (process.platform === 'linux') {
    const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8');
    return boot.trim();
  }
  if (process.platform !== 'darwin') {
    throw new Error('Shell custody boot identity is unavailable.');
  }
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/sbin/sysctl',
      ['-n', 'kern.boottime'],
      {
        timeout: 1000,
        killSignal: 'SIGKILL',
        maxBuffer: 4096,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- native environment names.
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error('Shell custody boot observation failed.', { cause: error }));
        } else if (/sec = \d+/u.test(stdout)) {
          resolve(stdout.trim());
        } else {
          reject(new Error('Shell custody boot identity is unrecognised.'));
        }
      },
    );
  });
};
const selfIdentity = async (): Promise<z.infer<typeof processIdentity>> => {
  const rows = await processTable();
  const row = rows.find((candidate) => candidate.pid === process.pid);
  if (row?.started === undefined) {
    throw new Error('Shell custody owner creation identity is unavailable.');
  }
  return { pid: process.pid, started: row.started };
};

/**
 * Own the existing shell provider's native execution receipts, outside command grants.
 *
 * @param options - Configured custody namespace and the shell service's private-session parent.
 * @returns The provider-local owner; stopped results retain native locks across returned promises.
 */
export const createShellCustody = (
  options: Readonly<{
    directory: string;
    sessionDirectory: string;
    /** The process table; injectable only to exercise unreadable-table retention. */
    table?: () => Promise<readonly ProcessRow[]>;
  }>,
): ShellCustody => {
  const reader = options.table ?? processTable;
  /* Every observation is bounded; a hung table read answers blocked instead of holding the recovery queue. */
  const table = async (): Promise<readonly ProcessRow[]> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        reader(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('The process table did not answer in time.'));
          }, 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const held = new Map<string, HeldCustody>();
  let pending: Promise<unknown> = Promise.resolve();
  const state = { closed: false };
  const serialized = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const previous = pending;
    const result = (async (): Promise<Result> => {
      await previous;
      return operation();
    })();
    pending = (async (): Promise<void> => {
      try {
        await result;
      } catch {
        /* A refused call cannot poison later recovery. */
      }
    })();
    return result;
  };
  const directory = async (): Promise<string> => {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const canonical = await realpath(options.directory);
    await identityOf(canonical);
    return canonical;
  };
  const recordPath = async (executionId: string): Promise<string> => {
    if (!z.uuid().safeParse(executionId).success) {
      throw new Error('Invalid shell custody execution identity.');
    }
    return join(await directory(), `${executionId}.json`);
  };
  const read = async (executionId: string): Promise<CustodyRecord> => {
    const path = await recordPath(executionId);
    const stats = await lstat(path);
    if (!stats.isFile() || stats.nlink !== 1 || stats.uid !== process.getuid?.()) {
      throw new Error('Shell custody record is not an owned regular file.');
    }
    const record = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (
      record.executionId !== executionId ||
      (record.resource === undefined) !== (record.resourceIdentity === undefined)
    ) {
      throw new Error('Shell custody record identity is inconsistent.');
    }
    if (
      (record.phase === 'prepared' && (record.root !== undefined || record.descendants.length > 0)) ||
      (record.phase === 'armed' && (record.root === undefined || record.supervisor === undefined))
    ) {
      throw new Error('Shell custody phase and process identities are inconsistent.');
    }
    const parent = await realpath(options.sessionDirectory);
    if (dirname(record.privateRoot) !== parent || !basename(record.privateRoot).startsWith('tau-shell-')) {
      throw new Error('Shell custody private root is outside the configured session parent.');
    }
    return record;
  };
  const syncDirectory = async (): Promise<void> => {
    const handle = await open(await directory(), constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  const persist = async (record: CustodyRecord, ownership: HeldCustody): Promise<void> => {
    await ownership.lock.assertCurrent();
    const target = await recordPath(record.executionId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await ownership.lock.assertCurrent();
      await rename(temporary, target);
      await syncDirectory();
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const current = async (executionId: string): Promise<Readonly<{ record: CustodyRecord; ownership: HeldCustody }>> => {
    const ownership = held.get(executionId);
    if (ownership === undefined) {
      throw new Error('Shell execution is not owned by this provider.');
    }
    await ownership.lock.assertCurrent();
    const record = await read(executionId);
    if (record.owner.token !== ownership.token) {
      throw new Error('Shell custody ownership is no longer current.');
    }
    return { record, ownership };
  };
  const validateRoots = async (record: CustodyRecord): Promise<void> => {
    try {
      const observed = await identityOf(record.privateRoot);
      if (observed.device !== record.privateIdentity.device || observed.inode !== record.privateIdentity.inode) {
        throw new Error('Shell custody private root identity changed.');
      }
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
    }
    if (record.resource !== undefined && record.resourceIdentity !== undefined) {
      const observed = await identityOf(record.resource.root);
      if (observed.device !== record.resourceIdentity.device || observed.inode !== record.resourceIdentity.inode) {
        throw new Error('Shell custody resource root identity changed.');
      }
    }
  };
  const identify = async (pids: readonly number[]): Promise<ReadonlyArray<z.infer<typeof processIdentity>>> => {
    const rows = await table();
    return pids.map((pid) => {
      const row = rows.find((candidate) => candidate.pid === pid && !candidate.zombie);
      if (row?.started === undefined || pid < 2) {
        throw new Error('A registered shell process is not running.');
      }
      return { pid, started: row.started };
    });
  };
  /*
   * Called only while holding the exclusive record lock, which the supervisor held until it exited. A changed boot
   * proves every recorded process gone. Otherwise only processes whose creation identity still matches are signalled;
   * a reused pid is not ours, and group members of an absent root are ambiguous, so they keep custody blocked.
   */
  const confirmArmedStopped = async (record: CustodyRecord): Promise<void> => {
    if ((await bootIdentity()) !== record.boot) {
      return;
    }
    const root = record.root!;
    const recorded = [root, record.supervisor!, ...record.descendants];
    const matching = (rows: readonly ProcessRow[]): readonly number[] =>
      recorded
        .filter((identity) =>
          rows.some((row) => row.pid === identity.pid && row.started === identity.started && !row.zombie),
        )
        .map((identity) => identity.pid);
    const deadline = Date.now() + recoveryMilliseconds;
    const rows = await table();
    if (matching(rows).includes(root.pid)) {
      const survivors = await terminateOwnedProcesses({
        root: root.pid,
        group: root.pid,
        deadlineMilliseconds: recoveryMilliseconds,
        table,
      });
      if (survivors.length > 0) {
        throw new Error(`Registered shell processes survived termination: ${survivors.join(', ')}.`);
      }
    } else if (rows.some((row) => row.pgid === root.pid && row.pid !== root.pid && !row.zombie)) {
      throw new Error('The registered shell process group cannot be attributed to this execution.');
    }
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- polled until the registered identities are gone or the deadline.
      const remaining = matching(await table());
      if (remaining.length === 0) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Registered shell processes are still running: ${remaining.join(', ')}.`);
      }
      for (const pid of remaining) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Already gone. */
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- polled until the deadline.
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
  };
  /*
   * This owner still holds the lock: a preparation that never launched, a launch whose handoff failed, or a stopped
   * claim being replayed. Holding the lock is exclusive custody, so an armed record is confirmed stopped here too.
   */
  const recoverOwned = async (executionId: string, observed: CustodyRecord): Promise<ShellRecovery> => {
    try {
      const { record, ownership } = await current(executionId);
      if (record.phase === 'stopped') {
        return { ...metadata(record), status: 'stopped' };
      }
      await validateRoots(record);
      if (record.phase === 'armed') {
        await confirmArmedStopped(record);
      }
      const stopped: CustodyRecord = { ...record, phase: 'stopped' };
      await persist(stopped, ownership);
      return { ...metadata(stopped), status: 'stopped' };
    } catch (error) {
      return {
        ...metadata(observed),
        status: 'blocked',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const ensureOpen = (): void => {
    if (state.closed) {
      throw new Error('Shell custody provider is closed.');
    }
  };
  return {
    prepare: async (input) =>
      serialized(async () => {
        ensureOpen();
        const parent = await realpath(options.sessionDirectory);
        const privateRoot = await realpath(input.privateRoot);
        if (dirname(privateRoot) !== parent || !basename(privateRoot).startsWith('tau-shell-')) {
          throw new Error('Shell custody private root is outside the configured session parent.');
        }
        const privateIdentity = await identityOf(privateRoot);
        const resource =
          input.resource === undefined
            ? undefined
            : { key: input.resource.key, root: await realpath(input.resource.root) };
        const resourceIdentity = resource === undefined ? undefined : await identityOf(resource.root);
        const executionId = randomUUID();
        const ownership = {
          lock: await acquireCustodyLock({ directory: await directory(), executionId }),
          token: randomUUID(),
        };
        held.set(executionId, ownership);
        try {
          const record = recordSchema.parse({
            version: 1,
            executionId,
            phase: 'prepared',
            privateRoot,
            privateIdentity,
            ...(resource === undefined ? {} : { resource, resourceIdentity }),
            boot: await bootIdentity(),
            owner: { ...(await selfIdentity()), token: ownership.token },
            descendants: [],
          });
          await persist(record, ownership);
          return { executionId };
        } catch (error) {
          held.delete(executionId);
          await ownership.lock.release();
          throw error;
        }
      }),
    descriptor: (executionId) => {
      const ownership = held.get(executionId);
      if (ownership === undefined) {
        throw new Error('Shell execution is not owned by this provider.');
      }
      return ownership.lock.descriptor;
    },
    register: async ({ executionId, supervisor, root }) =>
      serialized(async () => {
        ensureOpen();
        const { record, ownership } = await current(executionId);
        if (record.phase !== 'prepared') {
          throw new Error('Only a prepared shell execution can be registered.');
        }
        const [supervisorIdentity, rootIdentity] = await identify([supervisor, root]);
        await persist({ ...record, phase: 'armed', supervisor: supervisorIdentity, root: rootIdentity }, ownership);
      }),
    handoff: async (executionId) =>
      serialized(async () => {
        ensureOpen();
        const { record, ownership } = await current(executionId);
        if (record.phase !== 'armed') {
          throw new Error('Only a registered shell execution can be handed to its supervisor.');
        }
        held.delete(executionId);
        await ownership.lock.handoff();
      }),
    inventory: async () =>
      serialized(async () => {
        ensureOpen();
        const entries = await readdir(await directory());
        const names = entries.filter((name) => name.endsWith('.json')).toSorted();
        return Promise.all(names.map(async (name) => metadata(await read(name.slice(0, -5)))));
      }),
    recover: async ({ executionIds }) =>
      serialized(async () => {
        ensureOpen();
        return Promise.all(
          [...new Set(executionIds)].map(async (executionId): Promise<ShellRecovery> => {
            const record = await read(executionId);
            if (held.has(executionId)) {
              return recoverOwned(executionId, record);
            }
            let ownership: HeldCustody | undefined;
            try {
              ownership = {
                lock: await acquireCustodyLock({ directory: await directory(), executionId }),
                token: randomUUID(),
              };
              const latest = await read(executionId);
              await validateRoots(latest);
              if (latest.phase === 'armed') {
                await confirmArmedStopped(latest);
              }
              const stopped: CustodyRecord = {
                ...latest,
                phase: 'stopped',
                owner: { ...(await selfIdentity()), token: ownership.token },
              };
              await persist(stopped, ownership);
              held.set(executionId, ownership);
              return { ...metadata(stopped), status: 'stopped' };
            } catch (error) {
              await ownership?.lock.release();
              return {
                ...metadata(record),
                status: 'blocked',
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );
      }),
    release: async ({ executionId }) =>
      serialized(async () => {
        ensureOpen();
        const { record, ownership } = await current(executionId);
        if (record.phase !== 'stopped') {
          throw new Error('Shell execution has no confirmed stopped receipt.');
        }
        try {
          await lstat(record.privateRoot);
          throw new Error('Shell custody private root must be deleted before release.');
        } catch (error) {
          if (!missing(error)) {
            throw error;
          }
        }
        await ownership.lock.assertCurrent();
        await rm(await recordPath(executionId));
        await syncDirectory();
        held.delete(executionId);
        await ownership.lock.release();
      }),
    close: async () =>
      serialized(async () => {
        state.closed = true;
        await Promise.all([...held.values()].map(async (ownership) => ownership.lock.release()));
        held.clear();
      }),
  };
};
