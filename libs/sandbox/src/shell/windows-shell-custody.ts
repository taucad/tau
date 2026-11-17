/**
 * Durable execution receipts for the win32 shell provider (I7).
 *
 * The POSIX custody owner ({@link createShellCustody}) proves ownership with an inherited `flock` descriptor and process
 * creation identities from the POSIX process table; neither exists on Windows. Here a receipt is one JSON file per
 * execution, written and flushed before anything starts, naming this host's process, the helper's launcher and runner
 * once they exist, and the ACL journal the helper writes beside it. A receipt is claimed `stopped` only once every
 * recorded process is gone and the journal, if any, has been restored by the helper's own `restore`.
 */
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { z } from 'zod';

import type { PreparedShell, ShellExecution, ShellRecovery, ShellResource } from '#shell/shell-provider.js';

const recordSchema = z.strictObject({
  version: z.literal(1),
  executionId: z.uuid(),
  phase: z.enum(['prepared', 'launching', 'armed', 'stopped']),
  privateRoot: z.string().min(1),
  resource: z.strictObject({ key: z.string().min(1), root: z.string().min(1) }).optional(),
  owner: z.strictObject({ pid: z.number().int().positive(), token: z.uuid() }),
  journal: z.string().min(1).optional(),
  launcherPid: z.number().int().positive().optional(),
  runnerPid: z.number().int().positive().optional(),
});
type CustodyRecord = z.infer<typeof recordSchema>;

/**
 * Where an execution this owner holds is: prepared, its helper possibly running, its helper gone, or claimed stopped.
 */
type HeldState = 'prepared' | 'live' | 'ended' | 'stopped';
type Held = { token: string; state: HeldState };

/** Owner tokens issued in this process, so a receipt another provider here holds is never taken over. */
const liveTokens = new Set<string>();

/** @internal */
export type WindowsShellCustodyOptions = Readonly<{
  directory: string;
  sessionDirectory: string;
  /** Run the helper's `restore --journal <path>`; rejects when the helper does not confirm the restore. */
  restore: (journal: string) => Promise<void>;
  /** Whether a process exists. Defaults to a signal-0 probe, which reads a process of another account as alive. */
  processAlive?: ((pid: number) => boolean) | undefined;
}>;

/** @internal */
export type WindowsShellCustody = Readonly<{
  prepare: (
    input: Readonly<{
      privateRoot: string;
      resource: ShellResource | undefined;
    }>,
  ) => Promise<PreparedShell>;
  /** Durably mark a prepared execution as launching and name its journal, before the helper is spawned. */
  begin: (executionId: string) => Promise<string>;
  /** Durably record the helper's launcher and runner, before the start barrier opens. */
  arm: (executionId: string, pids: Readonly<{ launcherPid: number; runnerPid: number }>) => Promise<void>;
  /**
   * The helper process is gone. `confirmed` means it reported `exit`, so its job is empty and its descriptors are
   * restored, and the journal is removed; otherwise the journal stays for {@link WindowsShellCustody.recover}.
   */
  end: (executionId: string, confirmed: boolean) => Promise<void>;
  /** Whether a launch of this provider is live, or any journal (of any execution) still waits for its restore. */
  occupied: () => Promise<boolean>;
  inventory: () => Promise<readonly ShellExecution[]>;
  recover: (input: Readonly<{ executionIds: readonly string[] }>) => Promise<readonly ShellRecovery[]>;
  release: (input: PreparedShell) => Promise<void>;
}>;

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (missing(error)) {
      return false;
    }
    throw error;
  }
};

/** A signal-0 probe: `EPERM` is a process this account may not signal, which still exists. */
const defaultProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
};

const metadata = (record: CustodyRecord): ShellExecution => ({
  executionId: record.executionId,
  privateRoot: record.privateRoot,
  resource: record.resource,
});

/**
 * Own the win32 provider's execution receipts.
 *
 * @internal
 * @param options - The custody directory, the session parent private roots live in, and the helper's restore.
 * @returns The custody owner.
 */
export const createWindowsShellCustody = (options: WindowsShellCustodyOptions): WindowsShellCustody => {
  const alive = options.processAlive ?? defaultProcessAlive;
  const held = new Map<string, Held>();
  let pending: Promise<unknown> = Promise.resolve();
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
        /* A refused call cannot poison later calls. */
      }
    })();
    return result;
  };
  const directory = async (): Promise<string> => {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    return realpath(options.directory);
  };
  const checkedId = (executionId: string): string => {
    if (!z.uuid().safeParse(executionId).success) {
      throw new Error('Invalid shell custody execution identity.');
    }
    return executionId;
  };
  const recordPath = async (executionId: string): Promise<string> =>
    join(await directory(), `${checkedId(executionId)}.json`);
  /** The journal path is derived, never read from a receipt, so a rewritten receipt cannot aim `restore` elsewhere. */
  const journalPath = async (executionId: string): Promise<string> =>
    join(await directory(), `${checkedId(executionId)}.acl.json`);
  const read = async (executionId: string): Promise<CustodyRecord> => {
    const path = await recordPath(executionId);
    const stats = await lstat(path);
    if (!stats.isFile()) {
      throw new Error('Shell custody record is not a regular file.');
    }
    const record = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (record.executionId !== executionId) {
      throw new Error('Shell custody record identity is inconsistent.');
    }
    if (record.phase === 'armed' && (record.launcherPid === undefined || record.runnerPid === undefined)) {
      throw new Error('Shell custody phase and process identities are inconsistent.');
    }
    return record;
  };
  const syncDirectory = async (): Promise<void> => {
    /*
     * Windows cannot flush a directory through `fs` (the open succeeds, `fsync` answers EPERM: run 44003125074); NTFS
     * orders the rename after the file's own flush.
     */
    if (process.platform === 'win32') {
      return;
    }
    const handle = await open(await directory(), constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  const persist = async (record: CustodyRecord): Promise<void> => {
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
      await rename(temporary, target);
      await syncDirectory();
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const owned = async (executionId: string): Promise<Readonly<{ record: CustodyRecord; entry: Held }>> => {
    const entry = held.get(executionId);
    if (entry === undefined) {
      throw new Error('Shell execution is not owned by this provider.');
    }
    const record = await read(executionId);
    if (record.owner.token !== entry.token) {
      throw new Error('Shell custody ownership is no longer current.');
    }
    return { record, entry };
  };
  /** Restore what a journal still records, through the helper, and require the journal gone afterwards. */
  const restoreJournal = async (executionId: string): Promise<void> => {
    const journal = await journalPath(executionId);
    if (!(await exists(journal))) {
      return;
    }
    await options.restore(journal);
    if (await exists(journal)) {
      throw new Error('The sandbox helper did not confirm that this launch’s folder permissions were restored.');
    }
  };
  const claim = async (record: CustodyRecord, token: string): Promise<ShellRecovery> => {
    await restoreJournal(record.executionId);
    const stopped: CustodyRecord = {
      ...record,
      phase: 'stopped',
      owner: { pid: process.pid, token },
    };
    await persist(stopped);
    return { ...metadata(stopped), status: 'stopped' };
  };
  const recoverOne = async (executionId: string): Promise<ShellRecovery> => {
    const record = await read(executionId);
    const blocked = (message: string): ShellRecovery => ({
      ...metadata(record),
      status: 'blocked',
      message,
    });
    try {
      const entry = held.get(executionId);
      if (entry !== undefined) {
        if (record.owner.token !== entry.token) {
          return blocked('Shell custody ownership is no longer current.');
        }
        if (entry.state === 'live') {
          return blocked('The sandboxed shell is still running.');
        }
        if (entry.state === 'stopped' && record.phase === 'stopped') {
          return { ...metadata(record), status: 'stopped' };
        }
        const recovery = await claim(record, entry.token);
        entry.state = 'stopped';
        return recovery;
      }
      const otherOwner =
        record.owner.pid === process.pid ? liveTokens.has(record.owner.token) : alive(record.owner.pid);
      if (otherOwner) {
        return blocked('Another running Tau process owns this shell execution.');
      }
      const running = [record.launcherPid, record.runnerPid].filter(
        (pid): pid is number => pid !== undefined && alive(pid),
      );
      if (running.length > 0) {
        return blocked(`The sandbox helper of this execution is still running: ${running.join(', ')}.`);
      }
      const token = randomUUID();
      const recovery = await claim(record, token);
      liveTokens.add(token);
      held.set(executionId, { token, state: 'stopped' });
      return recovery;
    } catch (error) {
      return blocked(error instanceof Error ? error.message : String(error));
    }
  };
  return {
    prepare: async (input) =>
      serialized(async () => {
        const parent = await realpath(options.sessionDirectory);
        const privateRoot = await realpath(input.privateRoot);
        if (dirname(privateRoot) !== parent || !basename(privateRoot).startsWith('tau-shell-')) {
          throw new Error('Shell custody private root is outside the configured session parent.');
        }
        const resource =
          input.resource === undefined
            ? undefined
            : {
                key: input.resource.key,
                root: await realpath(input.resource.root),
              };
        const executionId = randomUUID();
        const token = randomUUID();
        await persist({
          version: 1,
          executionId,
          phase: 'prepared',
          privateRoot,
          ...(resource === undefined ? {} : { resource }),
          owner: { pid: process.pid, token },
        });
        liveTokens.add(token);
        held.set(executionId, { token, state: 'prepared' });
        return { executionId };
      }),
    begin: async (executionId) =>
      serialized(async () => {
        const { record, entry } = await owned(executionId);
        if (entry.state !== 'prepared' || record.phase !== 'prepared') {
          throw new Error('Only a prepared shell execution can launch, once.');
        }
        const journal = await journalPath(executionId);
        await persist({ ...record, phase: 'launching', journal });
        entry.state = 'live';
        return journal;
      }),
    arm: async (executionId, { launcherPid, runnerPid }) =>
      serialized(async () => {
        const { record, entry } = await owned(executionId);
        if (entry.state !== 'live' || record.phase !== 'launching') {
          throw new Error('Only a launching shell execution can be armed.');
        }
        await persist({ ...record, phase: 'armed', launcherPid, runnerPid });
      }),
    end: async (executionId, confirmed) =>
      serialized(async () => {
        const entry = held.get(executionId);
        if (entry?.state !== 'live') {
          return;
        }
        entry.state = 'ended';
        if (confirmed) {
          await rm(await journalPath(executionId), { force: true });
        }
      }),
    occupied: async () =>
      serialized(async () => {
        if ([...held.values()].some((entry) => entry.state === 'live')) {
          return true;
        }
        const entries = await readdir(await directory());
        return entries.some((name) => name.endsWith('.acl.json'));
      }),
    inventory: async () =>
      serialized(async () => {
        const entries = await readdir(await directory());
        const names = entries.filter((name) => /^[\da-f-]{36}\.json$/u.test(name)).toSorted();
        return Promise.all(names.map(async (name) => metadata(await read(name.slice(0, -'.json'.length)))));
      }),
    recover: async ({ executionIds }) =>
      serialized(async () => {
        const recoveries: ShellRecovery[] = [];
        for (const executionId of new Set(executionIds)) {
          // oxlint-disable-next-line no-await-in-loop -- one at a time: each may run the helper's restore.
          recoveries.push(await recoverOne(executionId));
        }
        return recoveries;
      }),
    release: async ({ executionId }) =>
      serialized(async () => {
        const { record, entry } = await owned(executionId);
        if (entry.state !== 'stopped' || record.phase !== 'stopped') {
          throw new Error('Shell execution has no confirmed stopped receipt.');
        }
        if (await exists(record.privateRoot)) {
          throw new Error('Shell custody private root must be deleted before release.');
        }
        if (await exists(await journalPath(executionId))) {
          throw new Error('Shell custody journal must be restored before release.');
        }
        await rm(await recordPath(executionId));
        await syncDirectory();
        held.delete(executionId);
        liveTokens.delete(entry.token);
      }),
  };
};
