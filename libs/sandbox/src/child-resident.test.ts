// @vitest-environment node
import { spawn } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { readFile as readProcFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { childResidentDepth, childResidentPids, linuxChildrenTree, sampleLinuxResident } from '#child-resident.js';
import type { LinuxResidentSources } from '#child-resident.js';
import { ownedProcesses } from '#shell/process-tree.js';
import type { ProcessRow } from '#shell/process-tree.js';

const kibibyte = 1024;
const mebibyte = 1024 * kibibyte;

/**
 * A `/proc` made of fixtures: each process's children file and its resident set in KiB.
 *
 * @param tree - Children by parent pid; a pid absent here has an empty children file.
 * @param resident - `VmRSS` in KiB by pid; a pid absent here has a status file without `VmRSS` (a zombie).
 * @param options - Pids whose files do not exist, and a table for the fallback.
 * @returns The sources and a spy on every path read.
 */
const fixtureProc = (
  tree: Readonly<Record<number, readonly number[]>>,
  resident: Readonly<Record<number, number>>,
  options: {
    readonly noChildrenFiles?: boolean;
    readonly gone?: readonly number[];
    readonly table?: ProcessRow[];
  } = {},
) => {
  const readFile = vi.fn(async (path: string): Promise<string> => {
    const [pidText, kind] = path.split('/').slice(2);
    const pid = Number(pidText);
    if (options.gone?.includes(pid)) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    if (kind === 'task') {
      if (options.noChildrenFiles === true) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return `${(tree[pid] ?? []).join(' ')}${(tree[pid] ?? []).length > 0 ? ' ' : ''}`;
    }
    const kib = resident[pid];
    return `Name:\tworker\nState:\tS (sleeping)\n${kib === undefined ? '' : `VmRSS:\t  ${String(kib)} kB\n`}Threads:\t1\n`;
  });
  const table = vi.fn(async (): Promise<readonly ProcessRow[]> => options.table ?? []);
  const sources: LinuxResidentSources = { readFile, table };
  return { sources, readFile, table };
};

/** The shape of the real Linux launch: sh, bwrap, its init, the script and two listeners, apply-seccomp, its init. */
const launchTree = {
  100: [101],
  101: [102],
  102: [103],
  103: [104, 105, 106],
  106: [107],
  107: [108],
  108: [109],
} as const;

describe('linuxChildrenTree', () => {
  it('should walk to the leaves, so a worker six levels below the wrapper is in the set', async () => {
    const { sources } = fixtureProc(launchTree, {});
    await expect(linuxChildrenTree(100, sources)).resolves.toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  });

  it('should stop ten levels below the root', async () => {
    const chain = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, [index + 2]]));
    const { sources } = fixtureProc(chain, {});
    const pids = await linuxChildrenTree(1, sources);
    expect(pids).toHaveLength(childResidentDepth + 1);
    expect(pids?.at(-1)).toBe(1 + childResidentDepth);
  });

  it('should hold at most 32 processes, and each once', async () => {
    const wide = { 1: [2, 2, ...Array.from({ length: 50 }, (_, index) => index + 3)] };
    const { sources } = fixtureProc(wide, {});
    const pids = await linuxChildrenTree(1, sources);
    expect(pids).toHaveLength(childResidentPids);
    expect(new Set(pids).size).toBe(childResidentPids);
  });

  it('should skip what is not a pid in a children file, and a child that exited mid-walk', async () => {
    const readFile = vi.fn(async (path: string) => (path === '/proc/1/task/1/children' ? '2 x -3 0 4\n' : ''));
    const sources: LinuxResidentSources = {
      readFile: async (path) => {
        if (path === '/proc/4/task/4/children') {
          throw new Error('ENOENT');
        }
        return readFile(path);
      },
      table: async () => [],
    };
    await expect(linuxChildrenTree(1, sources)).resolves.toEqual([1, 2, 4]);
  });

  it('should answer undefined when the kernel has no children files', async () => {
    const { sources } = fixtureProc(launchTree, {}, { noChildrenFiles: true });
    await expect(linuxChildrenTree(100, sources)).resolves.toBeUndefined();
  });
});

describe('sampleLinuxResident', () => {
  it('should sum VmRSS over the whole tree, skipping a process without one', async () => {
    const resident = { 100: 1000, 101: 2000, 102: 500, 103: 1500, 104: 3000, 105: 3000, 106: 800, 107: 400, 108: 600 };
    const { sources, table } = fixtureProc(launchTree, { ...resident, 109: 96 * kibibyte });
    const expected = Object.values(resident).reduce((sum, kib) => sum + kib, 96 * kibibyte) * kibibyte;
    await expect(sampleLinuxResident({ root: 100, group: 100 }, sources)).resolves.toBe(expected);
    expect(table).not.toHaveBeenCalled();
  });

  it('should fall back to the owned set of the process table where the children files are absent', async () => {
    const table: ProcessRow[] = [
      { pid: 100, ppid: 1, pgid: 100, zombie: false },
      { pid: 101, ppid: 100, pgid: 101, zombie: false },
      { pid: 102, ppid: 101, pgid: 101, zombie: false },
      { pid: 103, ppid: 101, pgid: 101, zombie: true },
      { pid: 104, ppid: 1, pgid: 100, zombie: false },
      { pid: 200, ppid: 1, pgid: 200, zombie: false },
    ];
    const { sources, readFile } = fixtureProc(
      {},
      { 100: 1, 101: 2, 102: 4, 104: 8, 200: 1000 },
      {
        noChildrenFiles: true,
        table,
      },
    );
    await expect(sampleLinuxResident({ root: 100, group: 100 }, sources)).resolves.toBe(15 * kibibyte);
    const statusReads = readFile.mock.calls
      .map(([path]) => /^\/proc\/(\d+)\/status$/u.exec(path)?.[1])
      .filter((pid) => pid !== undefined)
      .map(Number);
    expect(new Set(statusReads)).toEqual(ownedProcesses(table, 100, 100));
  });

  it('should answer undefined when no process of the tree reports a resident set', async () => {
    const { sources } = fixtureProc({ 1: [2] }, {}, { gone: [2] });
    await expect(sampleLinuxResident({ root: 1, group: 1 }, sources)).resolves.toBeUndefined();
  });
});

describe.runIf(process.platform === 'linux')('sampleLinuxResident on this host', () => {
  const started: number[] = [];
  afterEach(() => {
    for (const pid of started.splice(0)) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Gone already.
      }
    }
  });

  it('should find a worker nested below two shells and measure the bytes it touched', async () => {
    const touch = 96 * mebibyte;
    const script = `const b=Buffer.alloc(${String(touch)},1);console.log(1);setInterval(()=>b[0]++,1000);`;
    const wrapper = spawn('/bin/sh', ['-c', `/bin/sh -c '${process.execPath} -e "${script}"; :'; :`], {
      detached: true,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    started.push(wrapper.pid!);
    await new Promise<void>((resolve) => {
      wrapper.stdout.once('data', () => {
        resolve();
      });
    });
    const tree = await linuxChildrenTree(wrapper.pid!, {
      readFile: async (path) => readProcFile(path, 'utf8'),
      table: async () => [],
    });
    const executables = (tree ?? []).map((pid) => {
      try {
        return readlinkSync(`/proc/${String(pid)}/exe`);
      } catch {
        return undefined;
      }
    });
    expect(executables).toContain(process.execPath);
    const bytes = await sampleLinuxResident({ root: wrapper.pid!, group: wrapper.pid! });
    // Node's own baseline sits on top of the touched bytes; the shells add a few MiB.
    expect(bytes).toBeGreaterThan(touch);
    expect(bytes).toBeLessThan(touch + 128 * mebibyte);
  }, 20_000);
});
