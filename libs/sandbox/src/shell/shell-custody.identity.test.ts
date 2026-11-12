// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type * as processTree from '#shell/process-tree.js';
import { processTable } from '#shell/process-tree.js';
import { createShellCustody } from '#shell/shell-custody.js';

vi.mock('#shell/process-tree.js', async (importOriginal) => {
  const original = await importOriginal<typeof processTree>();
  return { ...original, processTable: vi.fn(original.processTable) };
});

const table = vi.mocked(processTable);

describe.runIf(process.platform === 'linux')('shell custody owner identity', () => {
  it('should read its own creation identity once, keep no failed read, and record it on every claim', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-owner-'));
    const directory = join(base, 'records');
    const sessionDirectory = join(base, 'sessions');
    await mkdir(sessionDirectory);
    const custody = createShellCustody({ directory, sessionDirectory });
    try {
      table.mockClear();
      table.mockRejectedValueOnce(new Error('ps failed'));
      const refusedRoot = await mkdtemp(join(sessionDirectory, 'tau-shell-'));
      await expect(custody.prepare({ privateRoot: refusedRoot, resource: undefined })).rejects.toThrow('ps failed');

      const claims = [];
      for (let index = 0; index < 3; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each claim is prepared in turn.
        const privateRoot = await mkdtemp(join(sessionDirectory, 'tau-shell-'));
        // oxlint-disable-next-line no-await-in-loop -- each claim is prepared in turn.
        claims.push(await custody.prepare({ privateRoot, resource: undefined }));
      }
      expect(table).toHaveBeenCalledTimes(2);

      const owners = await Promise.all(
        claims.map(async ({ executionId }) => {
          const record = JSON.parse(await readFile(join(directory, `${executionId}.json`), 'utf8')) as {
            owner: { pid: number; started: string };
          };
          return { pid: record.owner.pid, started: record.owner.started };
        }),
      );
      expect(new Set(owners.map((owner) => JSON.stringify(owner))).size).toBe(1);
      expect(owners[0]?.pid).toBe(process.pid);
      expect(owners[0]?.started).toMatch(/^\d+$/u);
    } finally {
      await custody.close();
      await rm(base, { recursive: true, force: true });
    }
  });
});
