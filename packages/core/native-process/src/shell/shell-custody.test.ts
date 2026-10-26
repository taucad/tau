// @vitest-environment node
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireCustodyLock } from '#shell/shell-custody.js';

const executionId = '11111111-1111-4111-8111-111111111111';

describe.runIf(process.platform === 'linux')('shell custody lock identity', () => {
  it('should reject an execution identity that could escape the configured namespace', async () => {
    await expect(acquireCustodyLock({ directory: '/not-opened', executionId: '../escape' })).rejects.toThrow(
      'Invalid shell custody execution identity',
    );
  });

  it('should refuse a symlink without modifying its target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-custody-link-'));
    try {
      const sentinel = join(directory, 'sentinel');
      await writeFile(sentinel, 'untouched');
      await symlink(sentinel, join(directory, `${executionId}.lock`));
      await expect(acquireCustodyLock({ directory, executionId })).rejects.toThrow();
      expect(await readFile(sentinel, 'utf8')).toBe('untouched');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should fence callbacks when the owned lock path is replaced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-custody-replaced-'));
    const owner = await acquireCustodyLock({ directory, executionId });
    try {
      const path = join(directory, `${executionId}.lock`);
      await rename(path, `${path}.displaced`);
      await writeFile(path, 'replacement');
      await expect(owner.assertCurrent()).rejects.toThrow('no longer current');
    } finally {
      await owner.release();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
