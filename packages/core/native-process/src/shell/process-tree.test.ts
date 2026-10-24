// @vitest-environment node
import { spawn } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { ownedProcesses, processTable, terminateOwnedProcesses } from '#shell/process-tree.js';

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
