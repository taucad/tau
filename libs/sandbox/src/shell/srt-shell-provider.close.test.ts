// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createShellCustody } from '#shell/shell-custody.js';

const fixture = fileURLToPath(new URL('custody-gc.fixture.ts', import.meta.url));

/*
 * A provider's custody is an open lock file per execution it holds. Its owner closes the provider before dropping it;
 * one left to garbage collection made Node 26 raise an uncaught `ERR_INVALID_STATE` for the lock's file handle (the
 * shell conformance and qualification rows on Node 26, 2026-11-24). The fixture prepares one execution, closes the
 * provider, waits, and then drops it and collects everything unreachable.
 */
describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('sandbox shell provider close', () => {
  it('should release the custody it holds on close, leaving no file handle for garbage collection', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-provider-close-'));
    const other = createShellCustody({ directory: join(base, 'records'), sessionDirectory: join(base, 'sessions') });
    try {
      const child = spawn(process.execPath, ['--expose-gc', fixture, base, 'close'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      const exited = new Promise<number | undefined>((resolve) => {
        child.once('exit', (code) => {
          resolve(code ?? undefined);
        });
      });
      const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
      const first = await lines.next();
      const executionId = String(first.value);
      expect(await lines.next(), stderr).toMatchObject({ value: 'closed' });

      /* While the provider's process still lives, its lock is free: only `close` can have released it. */
      expect(await other.recover({ executionIds: [executionId] })).toEqual([
        expect.objectContaining({ executionId, status: 'stopped' }),
      ]);

      child.stdin.end('drop\n');
      expect(await exited, stderr).toBe(0);
      expect(stderr).not.toMatch(/garbage collection/u);
    } finally {
      await other.close();
      await rm(base, { recursive: true, force: true });
    }
  });
});
