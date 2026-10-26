// @vitest-environment node
/** Native ownership projection of ShellCustody.tla; record/barrier replay follows in the protocol adapter. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireCustodyLock } from '#shell/shell-custody.js';

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
