// @vitest-environment node
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { processTable } from '#shell/process-tree.js';
import {
  abandonStartBarrier,
  openStartBarrier,
  stagedStartArguments,
  startBarrierRefusedCode,
} from '#shell/shell-start-barrier.js';

/*
 * ShellCustody SpawnBlocked/Start projection: a staged child exists (so its identity can be registered) but cannot
 * execute the workload vector until the owner opens the barrier. Host loss before opening never executes it.
 */
const posix = process.platform === 'linux' || process.platform === 'darwin';
const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const sentinelRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-start-barrier-'));
  roots.push(root);
  return root;
};

const stage = (argv: readonly string[]): ChildProcess => {
  const [executable, ...rest] = stagedStartArguments(argv);
  const child = spawn(executable!, rest, { stdio: ['ignore', 'pipe', 'ignore', 'pipe'], detached: true });
  children.push(child);
  return child;
};

const exitOf = async (child: ChildProcess): Promise<number | undefined> => {
  if (child.exitCode === null) {
    await once(child, 'exit', { signal: AbortSignal.timeout(5000) });
  }
  return child.exitCode ?? undefined;
};

const settle = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe.runIf(posix)('shell start barrier', () => {
  it('should keep a registered child from running its workload until the barrier opens', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const child = stage(['/bin/sh', '-c', 'echo ran > "$1"', 'workload', sentinel]);
    await settle(200);
    const table = await processTable();
    expect(table.some((row) => row.pid === child.pid && !row.zombie)).toBe(true);
    expect(existsSync(sentinel)).toBe(false);
    await openStartBarrier(child);
    expect(await exitOf(child)).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
  });

  it('should refuse the workload when the owner abandons the barrier', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const child = stage(['/bin/sh', '-c', 'echo ran > "$1"', 'workload', sentinel]);
    abandonStartBarrier(child);
    expect(await exitOf(child)).toBe(startBarrierRefusedCode);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('should never run the workload after its owner dies before opening', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const owner = spawn(
      process.execPath,
      [
        '-e',
        [
          'const { spawn } = require("node:child_process");',
          'const [executable, ...rest] = JSON.parse(process.argv[1]);',
          'const child = spawn(executable, rest, { stdio: ["ignore", "ignore", "ignore", "pipe"] });',
          String.raw`process.stdout.write(String(child.pid) + "\n");`,
          'setInterval(() => {}, 1000);',
        ].join(''),
        JSON.stringify(stagedStartArguments(['/bin/sh', '-c', 'echo ran > "$1"', 'workload', sentinel])),
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    children.push(owner);
    owner.stdout.setEncoding('utf8');
    const line = Promise.withResolvers<string>();
    owner.stdout.once('data', line.resolve);
    const pid = await line.promise;
    const staged = Number(pid.trim());
    owner.kill('SIGKILL');
    await exitOf(owner);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polled until the orphaned stage exits.
      const table = await processTable();
      if (!table.some((row) => row.pid === staged && !row.zombie)) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await settle(50);
    }
    const table = await processTable();
    expect(table.some((row) => row.pid === staged && !row.zombie)).toBe(false);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('should not pass the barrier descriptor to the workload', async () => {
    const child = stage(['/bin/sh', '-c', 'if (true >&3) 2>/dev/null; then echo leaked; else echo closed; fi']);
    child.stdout!.setEncoding('utf8');
    let output = '';
    child.stdout!.on('data', (chunk: string) => {
      output += chunk;
    });
    await openStartBarrier(child);
    expect(await exitOf(child)).toBe(0);
    expect(output.trim()).toBe('closed');
  });

  it('should refuse to open a child that has no barrier descriptor', async () => {
    const child = spawn('/bin/sh', ['-c', 'exit 0'], { stdio: 'ignore' });
    children.push(child);
    await expect(openStartBarrier(child)).rejects.toThrow('start barrier');
  });
});
