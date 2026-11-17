import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandAbortedError, gitCommandActivity, meteredGitCommand, runCommand, runGitCommand } from '#git-command.js';
import type { GitActivityEvent, GitCommandResult } from '#git-command.js';
import { removalRetries } from '#test/native-git-harness.js';
import { writeShellExecutable } from '#test/script-executable.js';

const cwd = tmpdir();

/* Each command is this Node.js, so every row runs as written on Windows too, where there is no `/bin/sh`. */
const node = (source: string): Readonly<{ executable: string; args: string[] }> => ({
  executable: process.execPath,
  args: ['-e', source],
});
const sleepLong = node('setTimeout(() => {}, 30_000);');

describe('bounded engine commands', () => {
  it('kills a command that outlives its deadline instead of waiting for it', async () => {
    const started = Date.now();
    await expect(runCommand({ ...sleepLong, cwd, deadline: 250 })).rejects.toThrow(CommandAbortedError);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('kills a command when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = runCommand({
      ...sleepLong,
      cwd,
      signal: controller.signal,
      deadline: 30_000,
    });
    setTimeout(() => {
      controller.abort();
    }, 100);
    await expect(pending).rejects.toMatchObject({ name: 'CommandAbortedError', reason: 'signal' });
  });

  it.each(['signal', 'deadline'] as const)('should stop descendant work after %s cancellation', async (reason) => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-command-descendant-'));
    const heartbeat = join(directory, 'heartbeat');
    const pidFile = join(directory, 'pid');
    const controller = new AbortController();
    const descendant = `const fs = require('node:fs');
      fs.writeFileSync(process.argv[2], String(process.pid));
      setInterval(() => fs.appendFileSync(process.argv[1], 'x'), 20);
      setTimeout(() => process.exit(), 10000);`;
    const parent = `require('node:child_process').spawn(process.execPath,
      ['-e', process.argv[1], process.argv[2], process.argv[3]], {stdio: 'inherit'});`;
    const pending = runCommand({
      executable: process.execPath,
      cwd,
      args: ['-e', parent, descendant, heartbeat, pidFile],
      signal: controller.signal,
      deadline: reason === 'deadline' ? 1500 : 5000,
    });
    const rejection = expect(pending).rejects.toMatchObject({ reason });
    try {
      await expect.poll(async () => readFile(heartbeat, 'utf8'), { timeout: 1200 }).not.toBe('');
      if (reason === 'signal') {
        controller.abort();
      }
      await rejection;
      await delay(100);
      const stopped = await readFile(heartbeat, 'utf8');
      await delay(200);
      expect(await readFile(heartbeat, 'utf8')).toBe(stopped);
    } finally {
      controller.abort();
      // Also clean up the deliberately orphaned descendant when this regression is red.
      const pid = Number(await readFile(pidFile, 'utf8').catch(() => '0'));
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Already reaped. */
        }
      }
      await rm(directory, { recursive: true, force: true, ...removalRetries });
    }
  });

  it('refuses to start when the signal is already aborted', async () => {
    await expect(runCommand({ ...node(''), cwd, signal: AbortSignal.abort() })).rejects.toMatchObject({
      reason: 'signal',
    });
  });

  it('kills a command that floods its captured output', async () => {
    await expect(
      runCommand({
        ...node(
          'const chunk = "0123456789012345678901234567890123456789".repeat(100);' +
            'const flood = () => { while (process.stdout.write(chunk)); process.stdout.once("drain", flood); };' +
            'flood();',
        ),
        cwd,
        maxBuffer: 4096,
        deadline: 10_000,
      }),
    ).rejects.toMatchObject({ reason: 'output-limit' });
  });

  it('carries the same bounds into the native Git adapter path', async () => {
    // The Git wrapper delegates to the bounded runner, so every native-Git call
    // site inherits the deadline without repeating it. A stand-in executable
    // stands for a Git subcommand that wedges (a stalled fetch, a held lock).
    const directory = await mkdtemp(join(tmpdir(), 'tau-revisions-'));
    const stub = await writeShellExecutable(join(directory, 'git-stub'), ['sleep 30']);
    try {
      await expect(runGitCommand({ gitExecutable: stub, cwd, args: ['fetch'], deadline: 250 })).rejects.toThrow(
        CommandAbortedError,
      );
    } finally {
      // Windows refuses to unlink the stand-in while the image of the launcher it just killed is still mapped.
      await rm(directory, { recursive: true, force: true, ...removalRetries });
    }
  });

  it('still returns captured bytes and status for a command inside its bounds', async () => {
    const result = await runCommand({
      ...node('process.stdout.write("ok", () => process.exit(3));'),
      cwd,
    });
    expect(result.exitCode).toBe(3);
    expect(new TextDecoder().decode(result.stdout)).toBe('ok');
  });
});

describe('gitCommandActivity', () => {
  /* Node stands in for git: `-C <dir>` is its `--conditions`, so `node -C <dir> -e ''` starts and exits. */
  const run = async (): Promise<unknown> =>
    runGitCommand({ gitExecutable: process.execPath, cwd: tmpdir(), args: ['-e', ''] });

  it('should count each process that finishes while a window is open, with its total and longest time', async () => {
    await run();
    const window = gitCommandActivity.open();
    await run();
    await run();
    const totals = window.close();
    await run();

    expect(totals.count).toBe(2);
    expect(totals.longestMilliseconds).toBeGreaterThan(0);
    expect(totals.totalMilliseconds).toBeGreaterThanOrEqual(totals.longestMilliseconds);
    expect(gitCommandActivity.open().close()).toStrictEqual({ count: 0, totalMilliseconds: 0, longestMilliseconds: 0 });
  });
});

describe('gitCommandActivity phases and slow processes', () => {
  const heard: GitActivityEvent[] = [];
  let stop = (): void => undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
    stop = gitCommandActivity.observe((event) => {
      heard.push(event);
    });
  });
  afterEach(() => {
    stop();
    heard.length = 0;
    vi.useRealTimers();
  });
  /* A process that takes `milliseconds` of the faked clock, then exits with `exitCode` or throws `error`. */
  const lasting =
    (milliseconds: number, ending: number | Error = 0) =>
    async (): Promise<GitCommandResult> => {
      vi.advanceTimersByTime(milliseconds);
      if (ending instanceof Error) {
        throw ending;
      }
      return { exitCode: ending, stdout: new Uint8Array(), stderr: new Uint8Array() };
    };

  it('should report a process of a second or more by its subcommand and phase alone, and each phase as it ends', async () => {
    await gitCommandActivity.during('open', async () => {
      await meteredGitCommand(
        ['-c', 'core.hooksPath=/home/ada/secret/hooks', '-C', '/home/ada/secret', 'lfs', 'install', '--local'],
        lasting(1500),
      );
      await meteredGitCommand(['cat-file', '--batch'], lasting(10));
    });
    await meteredGitCommand(['--literal-pathspecs', 'ls-files', '--', 'secret.txt'], lasting(1000, 1));
    await meteredGitCommand(['--version'], lasting(1200));

    expect(heard).toStrictEqual([
      { type: 'command', command: 'lfs install', milliseconds: 1500, outcome: 'exited', exitCode: 0, phase: 'open' },
      {
        type: 'phase',
        phase: 'open',
        status: 'completed',
        milliseconds: 1510,
        git: { count: 2, totalMilliseconds: 1510, longestMilliseconds: 1500 },
      },
      { type: 'command', command: 'ls-files', milliseconds: 1000, outcome: 'exited', exitCode: 1, phase: 'other' },
      { type: 'command', command: '--version', milliseconds: 1200, outcome: 'exited', exitCode: 0, phase: 'other' },
    ]);
    expect(JSON.stringify(heard)).not.toContain('secret');
  });

  it('should never label a process with a path given to an option that takes the next argument', async () => {
    await meteredGitCommand(['--git-dir', '/home/ada/secret/.git', 'status'], lasting(1000));
    await meteredGitCommand(['--work-tree', '/home/ada/secret', '--namespace', 'ada', 'log'], lasting(1000));
    await meteredGitCommand(['--config-env', 'core.sshCommand=SECRET_SSH', 'fetch'], lasting(1000));
    await meteredGitCommand(['--exec-path=/home/ada/secret/libexec'], lasting(1000));
    await meteredGitCommand(['--unknown-valued', '/home/ada/secret', 'status'], lasting(1000));
    await meteredGitCommand(['lfs', '/home/ada/secret'], lasting(1000));

    expect(heard.map((event) => (event.type === 'command' ? event.command : event.type))).toStrictEqual([
      'status',
      'log',
      'fetch',
      '--exec-path',
      '--unknown-valued',
      'lfs',
    ]);
    expect(JSON.stringify(heard)).not.toMatch(/secret/iu);
  });

  it('should report the bound that stopped a process, and a phase that threw as failed', async () => {
    const stopped = gitCommandActivity.during('admission', async () =>
      meteredGitCommand(['lfs', 'install'], lasting(30_000, new CommandAbortedError('deadline', 'stopped'))),
    );

    await expect(stopped).rejects.toBeInstanceOf(CommandAbortedError);
    expect(heard).toStrictEqual([
      { type: 'command', command: 'lfs install', milliseconds: 30_000, outcome: 'deadline', phase: 'admission' },
      {
        type: 'phase',
        phase: 'admission',
        status: 'failed',
        milliseconds: 30_000,
        git: { count: 1, totalMilliseconds: 30_000, longestMilliseconds: 30_000 },
      },
    ]);
  });

  it('should count in a phase only the processes its own work started', async () => {
    await Promise.all([
      gitCommandActivity.during('open', async () => meteredGitCommand(['status'], lasting(5))),
      meteredGitCommand(['fetch'], lasting(7)),
    ]);

    expect(heard).toMatchObject([{ type: 'phase', git: { count: 1 } }]);
  });
});
