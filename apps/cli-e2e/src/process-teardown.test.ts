import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { isAlive, processTreeStopLimit, removeInBackground, stopProcessTree } from '#process-teardown.test-utils.js';

/** A grandchild that leads its own process group, as a native worker does, and ignores `SIGTERM`. */
const stubbornGrandchild = `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`;

/**
 * Start a root that starts {@link stubbornGrandchild} and prints its pid.
 *
 * @param ignoreTerm - Whether the root ignores `SIGTERM` too.
 * @returns The root and its grandchild's pid.
 */
const startTree = async (
  ignoreTerm: boolean,
): Promise<{ readonly root: ChildProcess; readonly grandchild: number }> => {
  const rootScript = `
const { spawn } = require('node:child_process');
${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''}
const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(stubbornGrandchild)}], { detached: true, stdio: 'ignore' });
process.stdout.write(String(grandchild.pid) + '\\n');
setInterval(() => {}, 1000);
`;
  const root = spawn(process.execPath, ['-e', rootScript], { stdio: ['ignore', 'pipe', 'inherit'] });
  const grandchild = await new Promise<number>((resolve, reject) => {
    root.stdout.once('data', (chunk: Uint8Array<ArrayBuffer>) => {
      resolve(Number(Buffer.from(chunk).toString('utf8').trim()));
    });
    root.once('exit', () => {
      reject(new Error('The root exited before it started its grandchild.'));
    });
  });
  return { root, grandchild };
};

const started: number[] = [];

afterEach(() => {
  for (const pid of started.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, as the test expects.
    }
  }
});

describe.skipIf(process.platform === 'win32')('stopProcessTree', () => {
  it('should kill a root that ignores SIGTERM after the grace, with a grandchild that leads its own group', async () => {
    const { root, grandchild } = await startTree(true);
    started.push(root.pid!, grandchild);

    const stopped = await stopProcessTree(root, 500);

    expect(stopped.graceful).toBe(false);
    expect(stopped.survivors).toEqual([]);
    expect(stopped.elapsed).toBeGreaterThanOrEqual(500);
    expect(stopped.elapsed).toBeLessThan(processTreeStopLimit);
    expect(root.signalCode).toBe('SIGKILL');
    expect(isAlive(grandchild)).toBe(false);
  });

  it('should kill the orphan a root that stops on SIGTERM leaves behind', async () => {
    const { root, grandchild } = await startTree(false);
    started.push(root.pid!, grandchild);

    const stopped = await stopProcessTree(root);

    expect(stopped.graceful).toBe(true);
    expect(stopped.survivors).toEqual([]);
    expect(stopped.elapsed).toBeLessThan(processTreeStopLimit);
    expect(root.signalCode).toBe('SIGTERM');
    expect(isAlive(grandchild)).toBe(false);
  });

  it('should kill the tree at once with no grace', async () => {
    const { root, grandchild } = await startTree(false);
    started.push(root.pid!, grandchild);

    const stopped = await stopProcessTree(root, 0);

    expect(stopped.graceful).toBe(false);
    expect(root.signalCode).toBe('SIGKILL');
    expect(isAlive(grandchild)).toBe(false);
  });

  it('should answer at once for a process that already exited', async () => {
    const root = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((resolve) => {
      root.once('exit', resolve);
    });

    expect(await stopProcessTree(root)).toEqual({ graceful: true, elapsed: 0, survivors: [] });
  });
});

describe.skipIf(process.platform === 'win32')('removeInBackground', () => {
  it('should return before the directory is gone, and remove it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'process-teardown-'));
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'nested', 'file'), 'bytes');

    await removeInBackground(directory);

    const deadline = performance.now() + 5000;
    while (existsSync(directory) && performance.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- polling: the removal runs in another process.
      await sleep(20);
    }
    expect(existsSync(directory)).toBe(false);
  });
});
