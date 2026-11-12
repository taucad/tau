// @vitest-environment node
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireCustodyLock, createShellCustody } from '#shell/shell-custody.js';

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

describe.runIf(process.platform === 'linux')('durable shell custody intent', () => {
  it('should skip a live owner, retain stopped custody through root deletion, and permit one recovery owner', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-record-'));
    const directory = join(base, 'records');
    const sessionDirectory = join(base, 'sessions');
    await mkdir(sessionDirectory);
    const privateRoot = await mkdtemp(join(sessionDirectory, 'tau-shell-'));
    const resourceRoot = join(base, 'project');
    await mkdir(resourceRoot);
    const first = createShellCustody({ directory, sessionDirectory });
    const second = createShellCustody({ directory, sessionDirectory });
    const third = createShellCustody({ directory, sessionDirectory });
    try {
      const prepared = await first.prepare({ privateRoot, resource: { key: 'project/checkout', root: resourceRoot } });
      expect(await second.inventory()).toEqual([
        { ...prepared, privateRoot, resource: { key: 'project/checkout', root: resourceRoot } },
      ]);
      expect(await second.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'blocked' }),
      ]);
      await first.close();
      const competing = await Promise.all([
        second.recover({ executionIds: [prepared.executionId] }),
        third.recover({ executionIds: [prepared.executionId] }),
      ]);
      expect(
        competing
          .flat()
          .map((answer) => answer.status)
          .sort(),
      ).toEqual(['blocked', 'stopped']);
      const recovered = competing[0][0]!.status === 'stopped' ? second : third;
      await expect(recovered.release(prepared)).rejects.toThrow('private root');
      await rm(privateRoot, { recursive: true });
      await recovered.release(prepared);
      expect(await recovered.inventory()).toEqual([]);
    } finally {
      await Promise.all([first.close(), second.close(), third.close()]);
      await rm(base, { recursive: true, force: true });
    }
  });

  it('should let the owner stop its own never-launched preparation and replay that stopped claim', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-own-'));
    const directory = join(base, 'records');
    const privateRoot = await mkdtemp(join(base, 'tau-shell-'));
    const owner = createShellCustody({ directory, sessionDirectory: base });
    const other = createShellCustody({ directory, sessionDirectory: base });
    try {
      const prepared = await owner.prepare({ privateRoot, resource: undefined });
      expect(await owner.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'stopped' }),
      ]);
      expect(await owner.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'stopped' }),
      ]);
      // The stopped claim keeps the lock: nobody else can take it while the owner finishes cleanup.
      expect(await other.recover({ executionIds: [prepared.executionId] })).toEqual([
        expect.objectContaining({ ...prepared, status: 'blocked' }),
      ]);
      await rm(privateRoot, { recursive: true });
      await owner.release(prepared);
      expect(await other.inventory()).toEqual([]);
    } finally {
      await owner.close();
      await other.close();
      await rm(base, { recursive: true, force: true });
    }
  });

  it('should retain custody when the project resource root has been replaced', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-resource-'));
    const directory = join(base, 'records');
    const privateRoot = await mkdtemp(join(base, 'tau-shell-'));
    const resourceRoot = join(base, 'project');
    await mkdir(resourceRoot);
    const first = createShellCustody({ directory, sessionDirectory: base });
    const recovery = createShellCustody({ directory, sessionDirectory: base });
    try {
      const prepared = await first.prepare({ privateRoot, resource: { key: 'project/checkout', root: resourceRoot } });
      await first.close();
      await rename(resourceRoot, `${resourceRoot}.original`);
      await mkdir(resourceRoot);
      const answers = await recovery.recover({ executionIds: [prepared.executionId] });
      expect(answers).toEqual([expect.objectContaining({ ...prepared, status: 'blocked' })]);
      expect(answers[0]?.status === 'blocked' ? answers[0].message : '').toContain('resource root identity changed');
      expect(await recovery.inventory()).toHaveLength(1);
      await expect(recovery.release(prepared)).rejects.toThrow('not owned');
    } finally {
      await first.close();
      await recovery.close();
      await rm(base, { recursive: true, force: true });
    }
  });

  it('should reject incomplete inventory rather than silently discard malformed custody', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-custody-corrupt-'));
    const directory = join(base, 'records');
    await mkdir(directory);
    const custody = createShellCustody({ directory, sessionDirectory: base });
    try {
      await writeFile(join(directory, `${executionId}.json`), '{');
      await expect(custody.inventory()).rejects.toThrow();
    } finally {
      await custody.close();
      await rm(base, { recursive: true, force: true });
    }
  });
});
