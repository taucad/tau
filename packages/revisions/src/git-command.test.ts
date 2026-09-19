import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommandAbortedError, runCommand, runGitCommand } from '#git-command.js';

const cwd = tmpdir();

describe('bounded engine commands', () => {
  it('kills a command that outlives its deadline instead of waiting for it', async () => {
    const started = Date.now();
    await expect(runCommand({ executable: '/bin/sh', cwd, args: ['-c', 'sleep 30'], deadline: 250 })).rejects.toThrow(
      CommandAbortedError,
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('kills a command when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = runCommand({
      executable: '/bin/sh',
      cwd,
      args: ['-c', 'sleep 30'],
      signal: controller.signal,
      deadline: 30_000,
    });
    setTimeout(() => {
      controller.abort();
    }, 100);
    await expect(pending).rejects.toMatchObject({ name: 'CommandAbortedError', reason: 'signal' });
  });

  it('refuses to start when the signal is already aborted', async () => {
    await expect(
      runCommand({ executable: '/bin/sh', cwd, args: ['-c', 'true'], signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ reason: 'signal' });
  });

  it('kills a command that floods its captured output', async () => {
    await expect(
      runCommand({
        executable: '/bin/sh',
        cwd,
        args: ['-c', 'while :; do printf "0123456789012345678901234567890123456789"; done'],
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
    const stub = join(directory, 'git-stub');
    await writeFile(stub, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    try {
      await expect(runGitCommand({ gitExecutable: stub, cwd, args: ['fetch'], deadline: 250 })).rejects.toThrow(
        CommandAbortedError,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('still returns captured bytes and status for a command inside its bounds', async () => {
    const result = await runCommand({ executable: '/bin/sh', cwd, args: ['-c', 'printf ok; exit 3'] });
    expect(result.exitCode).toBe(3);
    expect(new TextDecoder().decode(result.stdout)).toBe('ok');
  });
});
