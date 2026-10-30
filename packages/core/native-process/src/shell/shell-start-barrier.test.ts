/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
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
  createTerminalStartGate,
  openStartBarrier,
  stagedTerminalStartArguments,
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

/*
 * The terminal variant (node-pty cannot pass a descriptor 3): the staged wrapper reads one line from its own PTY with
 * echo off, compares it with a per-launch gate it alone was given, and only then executes. The host writes nothing
 * else to the PTY before the gate opens and forwards nothing the PTY printed before the start marker.
 */
type Pty = Readonly<{
  pid: number;
  onData: (listener: (data: string | Uint8Array<ArrayBuffer>) => void) => void;
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  kill: (signal?: string) => void;
}>;
type PtyModule = Readonly<{
  spawn: (
    file: string,
    args: readonly string[],
    options: Readonly<{ name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }>,
  ) => Pty;
}>;
const loadPty = async (): Promise<PtyModule | undefined> => {
  try {
    // eslint-disable-next-line import-x/no-extraneous-dependencies -- the provider's own optional dependency.
    const module = (await import('node-pty')) as unknown as { default?: PtyModule } & PtyModule;
    return module.default ?? module;
  } catch {
    return undefined;
  }
};
const pty = await loadPty();

const stageTerminal = (argv: readonly string[]) => {
  const gate = createTerminalStartGate();
  const [executable, ...rest] = stagedTerminalStartArguments(argv);
  const terminal = pty!.spawn(executable!, rest, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: tmpdir(),
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', ...gate.environment },
  });
  let raw = '';
  let forwarded = '';
  const decoder = new TextDecoder();
  terminal.onData((data) => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    raw += decoder.decode(bytes, { stream: true });
    const passed = gate.pass(bytes);
    if (passed !== undefined) {
      forwarded += decoder.decode(passed, { stream: true });
    }
  });
  const exited = new Promise<number>((resolve) => {
    terminal.onExit(({ exitCode }) => {
      resolve(exitCode);
    });
  });
  return {
    gate,
    terminal,
    exited,
    raw: () => raw,
    forwarded: () => forwarded,
  };
};

describe.runIf(posix && pty !== undefined)('terminal start barrier', () => {
  it('should run the workload only after the gate opens, never showing the gate', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const staged = stageTerminal(['/bin/sh', '-c', 'echo ran > "$1"; echo workload-output', 'workload', sentinel]);
    await settle(300);
    expect(existsSync(sentinel)).toBe(false);
    staged.gate.open((line) => {
      staged.terminal.write(line);
    });

    expect(await staged.exited).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
    await settle(100);
    expect(staged.forwarded()).toContain('workload-output');
    expect(staged.raw()).not.toContain(staged.gate.environment.TAU_START_GATE);
    expect(staged.forwarded()).not.toContain('tau-start');
  });

  it('should not forward the gate even when it is written before echo is off', async () => {
    const staged = stageTerminal(['/bin/sh', '-c', 'echo workload-output']);
    staged.gate.open((line) => {
      staged.terminal.write(line);
    });

    expect(await staged.exited).toBe(0);
    await settle(100);
    expect(staged.forwarded()).toContain('workload-output');
    expect(staged.forwarded()).not.toContain(staged.gate.environment.TAU_START_GATE);
  });

  it('should refuse a line that is not the gate, such as typed input', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const staged = stageTerminal(['/bin/sh', '-c', 'echo ran > "$1"', 'workload', sentinel]);
    await settle(200);
    staged.terminal.write('start\n');

    expect(await staged.exited).toBe(startBarrierRefusedCode);
    expect(existsSync(sentinel)).toBe(false);
    expect(staged.forwarded()).toBe('');
  });

  it('should not pass the gate to the workload environment', async () => {
    const staged = stageTerminal([
      '/bin/sh',
      '-c',
      'if [ -n "$TAU_START_GATE" ]; then echo gate=seen; else echo gate=none; fi',
    ]);
    await settle(200);
    staged.gate.open((line) => {
      staged.terminal.write(line);
    });

    expect(await staged.exited).toBe(0);
    await settle(100);
    expect(staged.forwarded()).toContain('gate=none');
  });

  it('should never run the workload after its terminal owner dies before opening', async () => {
    const sentinel = join(sentinelRoot(), 'ran');
    const gate = createTerminalStartGate();
    const owner = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          'const pty = await import("node-pty");',
          'const [executable, ...rest] = JSON.parse(process.argv[1]);',
          'const env = JSON.parse(process.argv[2]);',
          'const t = (pty.default ?? pty).spawn(executable, rest, { name: "xterm", cols: 80, rows: 24, cwd: "/", env });',
          String.raw`process.stdout.write(String(t.pid) + "\n");`,
          'setInterval(() => {}, 1000);',
        ].join('\n'),
        JSON.stringify(stagedTerminalStartArguments(['/bin/sh', '-c', 'echo ran > "$1"', 'workload', sentinel])),
        JSON.stringify({ PATH: '/usr/bin:/bin', ...gate.environment }),
      ],
      { stdio: ['ignore', 'pipe', 'ignore'], cwd: process.cwd() },
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
});
