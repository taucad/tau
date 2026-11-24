// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createShellCustody } from '#shell/shell-custody.js';

const fixture = fileURLToPath(new URL('custody-gc.fixture.ts', import.meta.url));

/*
 * A provider's custody is an open lock file per execution it holds. Its owner closes the provider before dropping it;
 * one left to garbage collection made Node 26 raise an uncaught `ERR_INVALID_STATE` for the lock's file handle (the
 * shell conformance and qualification rows on Node 26, 2026-11-24). The fixture drops a provider holding one prepared
 * execution and then collects everything unreachable.
 */
describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('sandbox shell provider close', () => {
  it('should release the custody it holds on close, leaving no file handle for garbage collection', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-provider-close-'));
    try {
      const run = spawnSync(process.execPath, ['--expose-gc', fixture, base, 'close'], { encoding: 'utf8' });

      expect(run.stderr).not.toMatch(/garbage collection/u);
      expect(run.status, run.stderr).toBe(0);
      /* The lock is free: another custody recovers the execution the closed provider had prepared. */
      const executionId = run.stdout.trim();
      const other = createShellCustody({ directory: join(base, 'records'), sessionDirectory: join(base, 'sessions') });
      try {
        expect(await other.recover({ executionIds: [executionId] })).toEqual([
          expect.objectContaining({ executionId, status: 'stopped' }),
        ]);
      } finally {
        await other.close();
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
