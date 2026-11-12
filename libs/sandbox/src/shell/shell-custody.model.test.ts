// @vitest-environment node
/** Native ownership and protocol projection of ShellCustody.tla over the real lock, record and start barrier. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { processTable } from '#shell/process-tree.js';
import { acquireCustodyLock, createShellCustody } from '#shell/shell-custody.js';
import { abandonStartBarrier, openStartBarrier, stagedStartArguments } from '#shell/shell-start-barrier.js';

// This is a native lock test, not an own-PTY or sandbox qualification.
describe.runIf(process.platform === 'linux')('ShellCustody ownership projection', () => {
  it('should fence the old token at handoff and refuse both recovery actors until supervisor exit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-custody-model-'));
    const input = { directory, executionId: '11111111-1111-4111-8111-111111111111' };
    const owner = await acquireCustodyLock(input);
    let supervisor: ReturnType<typeof spawn> | undefined;
    try {
      // Init: the prepared execution has one native owner.
      await owner.assertCurrent();
      // Claim(recovery1), Claim(recovery2): neither can replace a live owner.
      await expect(acquireCustodyLock(input)).rejects.toThrow('already owned');
      await expect(acquireCustodyLock(input)).rejects.toThrow('already owned');
      supervisor = spawn(
        process.execPath,
        [
          '-e',
          'process.stdout.write("ready"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));',
        ],
        { stdio: ['pipe', 'pipe', 'ignore', owner.descriptor] },
      );
      await once(supervisor.stdout!, 'data', { signal: AbortSignal.timeout(2000) });
      // Handoff: old callbacks lose their authority; the inherited descriptor retains the kernel lock.
      await owner.handoff();
      await expect(owner.assertCurrent()).rejects.toThrow('no longer current');
      await expect(acquireCustodyLock(input)).rejects.toThrow('already owned');
      // Crash(supervisor): OS descriptor release permits exactly one new recovery owner.
      const exit = once(supervisor, 'exit', { signal: AbortSignal.timeout(2000) });
      supervisor.stdin!.end();
      await exit;
      const recovery = await acquireCustodyLock(input);
      try {
        await expect(acquireCustodyLock(input)).rejects.toThrow('already owned');
        // StaleCallback(host) cannot release the successor's lock.
        await owner.release();
        await recovery.assertCurrent();
        await expect(acquireCustodyLock(input)).rejects.toThrow('already owned');
      } finally {
        await recovery.release();
      }
    } finally {
      supervisor?.kill('SIGKILL');
      await owner.release();
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);
});

/*
 * ShellCustody protocol projection: SpawnBlocked, PersistRegistration, Handoff, AcknowledgeRegistration, Start,
 * Crash, Claim, ObserveStopped/PersistStopped (through scoped recovery) and StaleCallback, over the real lock, durable
 * record and start barrier. The supervisor stand-in only holds the inherited lock; it is not a sandbox.
 */
describe.runIf(process.platform === 'linux')('ShellCustody protocol projection', () => {
  const settle = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  const alive = async (pid: number | undefined): Promise<boolean> => {
    const table = await processTable();
    return table.some((row) => row.pid === pid && !row.zombie);
  };
  const until = async (condition: () => Promise<boolean>): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polled until the condition holds.
      if (await condition()) {
        return;
      }
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await settle(20);
    }
  };

  const fixture = async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-protocol-'));
    const directory = join(base, 'records');
    const sessionDirectory = join(base, 'sessions');
    await mkdir(sessionDirectory);
    const privateRoot = await mkdtemp(join(sessionDirectory, 'tau-shell-'));
    const sentinel = join(base, 'ran');
    const host = createShellCustody({ directory, sessionDirectory });
    const recovery = createShellCustody({ directory, sessionDirectory });
    const spawned: Array<ReturnType<typeof spawn>> = [];
    const prepared = await host.prepare({ privateRoot, resource: undefined });
    /* The supervisor inherits the execution's lock descriptor when it is spawned, before registration. */
    const supervisor = spawn(
      process.execPath,
      ['-e', 'process.stdout.write("ready"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
      { stdio: ['pipe', 'pipe', 'ignore', host.descriptor(prepared.executionId)] },
    );
    spawned.push(supervisor);
    await once(supervisor.stdout!, 'data', { signal: AbortSignal.timeout(2000) });
    // SpawnBlocked: the staged child exists, but cannot execute the workload.
    const [executable, ...rest] = stagedStartArguments([
      '/bin/sh',
      '-c',
      'echo ran > "$1"; exec sleep 30',
      'workload',
      sentinel,
    ]);
    const staged = spawn(executable!, rest, { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], detached: true });
    spawned.push(staged);
    const cleanup = async (): Promise<void> => {
      for (const child of spawned) {
        child.kill('SIGKILL');
      }
      await Promise.all([host.close(), recovery.close()]);
      await rm(base, { recursive: true, force: true });
    };
    return {
      base,
      directory,
      sessionDirectory,
      privateRoot,
      sentinel,
      host,
      recovery,
      prepared,
      supervisor,
      staged,
      cleanup,
    };
  };

  it('should never start the workload after host loss before the barrier opens', async () => {
    const { sentinel, host, recovery, prepared, supervisor, staged, cleanup } = await fixture();
    try {
      // PersistRegistration, then Handoff: the host token is stale afterwards.
      await host.register({ executionId: prepared.executionId, supervisor: supervisor.pid!, root: staged.pid! });
      expect(await recovery.inventory()).toEqual([expect.objectContaining(prepared)]);
      await host.handoff(prepared.executionId);
      // StaleCallback(host): a fenced host can neither register again nor release.
      await expect(
        host.register({ executionId: prepared.executionId, supervisor: supervisor.pid!, root: staged.pid! }),
      ).rejects.toThrow('not owned');
      await expect(host.release(prepared)).rejects.toThrow('not owned');
      // Claim(recovery) while the supervisor lives: never a takeover.
      expect(await recovery.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'blocked' }),
      ]);
      // Crash(host) before Start: the barrier closes and the workload never runs.
      abandonStartBarrier(staged);
      await until(async () => !(await alive(staged.pid)));
      expect(existsSync(sentinel)).toBe(false);
      // Crash(supervisor): the OS releases the lock; one recovery confirms the stop.
      supervisor.kill('SIGKILL');
      await until(async () => !(await alive(supervisor.pid)));
      expect(await recovery.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'stopped' }),
      ]);
    } finally {
      await cleanup();
    }
  }, 20_000);

  it('should terminate exactly the registered survivor once its supervisor is gone', async () => {
    const { sentinel, host, recovery, prepared, supervisor, staged, cleanup } = await fixture();
    try {
      await host.register({ executionId: prepared.executionId, supervisor: supervisor.pid!, root: staged.pid! });
      await host.handoff(prepared.executionId);
      // AcknowledgeRegistration is the supervisor's inherited lock; Start opens the barrier.
      await expect(
        acquireCustodyLock({ directory: dirname(sentinel) + '/records', executionId: prepared.executionId }),
      ).rejects.toThrow('already owned');
      await openStartBarrier(staged);
      await until(async () => existsSync(sentinel));
      expect(existsSync(sentinel)).toBe(true);
      supervisor.kill('SIGKILL');
      await until(async () => !(await alive(supervisor.pid)));
      expect(await alive(staged.pid)).toBe(true);
      expect(await recovery.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'stopped' }),
      ]);
      expect(await alive(staged.pid)).toBe(false);
    } finally {
      await cleanup();
    }
  }, 20_000);

  it('should keep armed custody blocked when the process table cannot be read', async () => {
    const { directory, sessionDirectory, host, prepared, supervisor, staged, cleanup } = await fixture();
    const blind = createShellCustody({
      directory,
      sessionDirectory,
      table: async () => {
        throw new Error('table unavailable');
      },
    });
    try {
      await host.register({ executionId: prepared.executionId, supervisor: supervisor.pid!, root: staged.pid! });
      await host.handoff(prepared.executionId);
      await openStartBarrier(staged);
      supervisor.kill('SIGKILL');
      await until(async () => !(await alive(supervisor.pid)));
      const [answer] = await blind.recover({ executionIds: [prepared.executionId] });
      expect(answer).toEqual(expect.objectContaining({ ...prepared, status: 'blocked' }));
      expect(answer?.status === 'blocked' ? answer.message : '').toContain('table unavailable');
      expect(await alive(staged.pid)).toBe(true);
      expect(JSON.parse(await readFile(join(directory, `${prepared.executionId}.json`), 'utf8'))).toMatchObject({
        phase: 'armed',
      });
    } finally {
      await blind.close();
      await cleanup();
    }
  }, 20_000);
});
