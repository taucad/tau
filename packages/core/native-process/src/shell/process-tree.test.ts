// @vitest-environment node
import { spawn } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import type { ProcessRow } from '#shell/process-tree.js';
import { ownedProcesses, processTable, terminateOwnedProcesses, trackDescendants } from '#shell/process-tree.js';

describe('ownedProcesses', () => {
  it('should own the tree under the root and the root group, without zombies', () => {
    const table = [
      { pid: 10, ppid: 1, pgid: 10, zombie: false },
      { pid: 11, ppid: 10, pgid: 10, zombie: false },
      { pid: 12, ppid: 11, pgid: 12, zombie: false },
      { pid: 13, ppid: 1, pgid: 10, zombie: false },
      { pid: 14, ppid: 11, pgid: 14, zombie: true },
      { pid: 20, ppid: 1, pgid: 20, zombie: false },
    ];

    expect([...ownedProcesses(table, 10, 10)].sort((left, right) => left - right)).toStrictEqual([10, 11, 12, 13]);
  });
});

describe('terminateOwnedProcesses', () => {
  it('should kill already frozen descendants when reading the process table fails', async () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    let reads = 0;
    try {
      await expect(
        terminateOwnedProcesses({
          root: 100,
          group: 100,
          deadlineMilliseconds: 10,
          table: async () => {
            reads += 1;
            if (reads > 1) {
              throw new Error('process table unavailable');
            }
            return [{ pid: 101, ppid: 100, pgid: 101, zombie: false }];
          },
        }),
      ).rejects.toThrow('process table unavailable');
      expect(kill).toHaveBeenCalledWith(101, 'SIGSTOP');
      expect(kill).toHaveBeenCalledWith(101, 'SIGKILL');
      expect(kill).toHaveBeenCalledWith(-100, 'SIGKILL');
    } finally {
      kill.mockRestore();
    }
  });

  it('should bound a hung table read and still kill the already frozen tree', async () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    let reads = 0;
    try {
      const termination = terminateOwnedProcesses({
        root: 100,
        group: 100,
        deadlineMilliseconds: 50,
        table: async () => {
          reads += 1;
          return reads === 1
            ? [{ pid: 101, ppid: 100, pgid: 101, zombie: false }]
            : Promise.withResolvers<readonly ProcessRow[]>().promise;
        },
      });
      const rejected = expect(termination).rejects.toThrow('termination is unconfirmed');
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(kill).toHaveBeenCalledWith(101, 'SIGKILL');
      expect(kill).toHaveBeenCalledWith(-100, 'SIGKILL');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      kill.mockRestore();
      vi.useRealTimers();
    }
  });

  it('should report a live root as a survivor rather than successful cleanup', async () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    try {
      const termination = terminateOwnedProcesses({
        root: 100,
        group: 100,
        deadlineMilliseconds: 20,
        table: async () => [{ pid: 100, ppid: 1, pgid: 100, zombie: false }],
      });
      await vi.advanceTimersByTimeAsync(20);
      await expect(termination).resolves.toStrictEqual([100]);
    } finally {
      kill.mockRestore();
      vi.useRealTimers();
    }
  });

  it('should do nothing for a launch that never started', async () => {
    expect(await terminateOwnedProcesses({ root: -1, group: -1, deadlineMilliseconds: 10 })).toStrictEqual([]);
  });

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'should stop a tree whose members left the group and were reparented',
    async () => {
      const child = spawn('/bin/sh', ['-c', '(set -m; sleep 301 & sleep 302 & wait) & sleep 303 & echo $$; wait'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      await new Promise((resolve) => {
        child.stdout.once('data', resolve);
      });
      let owned = new Set<number>();
      for (const deadline = Date.now() + 5000; owned.size < 5 && Date.now() < deadline; ) {
        // oxlint-disable-next-line no-await-in-loop -- waits for the fixture's three sleeps and subshell to start.
        owned = new Set(ownedProcesses(await processTable(), child.pid!, child.pid!));
      }

      const survivors = await terminateOwnedProcesses({
        root: child.pid!,
        group: child.pid!,
        deadlineMilliseconds: 5000,
      });
      const finalTable = await processTable();
      const after = new Set(finalTable.filter((row) => !row.zombie).map((row) => row.pid));

      expect(owned.size).toBe(5);
      expect(survivors).toStrictEqual([]);
      expect([...owned].filter((pid) => pid !== child.pid && after.has(pid))).toStrictEqual([]);
    },
  );
});

describe('trackDescendants', () => {
  it('should stop tracking after a bounded failed read without overlapping polls', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const tracker = trackDescendants(100, async () => {
      reads += 1;
      return Promise.withResolvers<readonly ProcessRow[]>().promise;
    });
    try {
      await vi.advanceTimersByTimeAsync(750);
      expect(reads).toBe(1);
      const stopped = tracker.stop();
      await vi.advanceTimersByTimeAsync(500);
      await stopped;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await tracker.stop();
      vi.useRealTimers();
    }
  });

  it('should drop remembered ownership when a process id is reused', async () => {
    let row = { pid: 11, ppid: 10, pgid: 11, zombie: false, started: 'first' };
    const tracker = trackDescendants(10, async () => [row]);
    try {
      expect(await tracker.table()).toStrictEqual([row]);
      row = { ...row, ppid: 1 };
      expect(await tracker.table()).toStrictEqual([{ ...row, ppid: 10 }]);
      row = { ...row, started: 'replacement' };
      expect(await tracker.table()).toStrictEqual([row]);
    } finally {
      await tracker.stop();
    }
  });

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'should retain a separately grouped child after its parent dies',
    async () => {
      const child = spawn('/bin/bash', ['--noprofile', '--norc', '-c', 'set -m; sleep 300 & echo $!; wait'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const tracker = trackDescendants(child.pid!);
      let sleeper = 0;
      try {
        sleeper = Number(
          await new Promise<string>((resolve) => {
            child.stdout.once('data', (chunk: Uint8Array<ArrayBuffer>) => {
              resolve(new TextDecoder().decode(chunk).trim());
            });
          }),
        );
        const before = await tracker.table();
        const row = before.find((entry) => entry.pid === sleeper);

        expect(row?.pgid).not.toBe(child.pid);
        expect(row?.ppid).toBe(child.pid);

        const exited = new Promise((resolve) => {
          child.once('exit', resolve);
        });
        child.kill('SIGKILL');
        await exited;

        const retained = await tracker.table();
        expect(retained.find((entry) => entry.pid === sleeper)?.ppid).toBe(child.pid);
        expect(
          await terminateOwnedProcesses({
            root: child.pid!,
            group: child.pid!,
            deadlineMilliseconds: 5000,
            table: tracker.table,
          }),
        ).toStrictEqual([]);
        const remaining = await processTable();
        expect(remaining.some((entry) => entry.pid === sleeper && !entry.zombie)).toBe(false);
      } finally {
        child.kill('SIGKILL');
        if (sleeper > 1) {
          try {
            process.kill(sleeper, 'SIGKILL');
          } catch {
            /* Already reaped by the tested cleanup. */
          }
        }
        await tracker.stop();
      }
    },
  );
});
