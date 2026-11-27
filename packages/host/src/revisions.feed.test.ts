/**
 * The disk host's change feed is complete (W4 a3, E1 on the native leg).
 *
 * A save re-reads only what the watcher named, and it still records a write
 * whose watcher event had not arrived when the save was asked for: the save
 * waits for the watcher first. A watcher that loses track makes the next save
 * read everything.
 */
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIsomorphicGitRevisionPort,
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
} from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { NodeFsWatchEvent } from '@taucad/filesystem/backend/node';

import { createProjectRevisions } from '#revisions.js';
import type { ProjectRevisions } from '#revisions.js';

/* Every handler the host hands the provider's watch, so a row can speak for the platform. */
const watched: Array<(event: NodeFsWatchEvent) => void> = [];
const providerWatch = NodeFsProvider.prototype.watch;
vi.spyOn(NodeFsProvider.prototype, 'watch').mockImplementation(async function (this: NodeFsProvider, request, handler) {
  watched.push(handler);
  return providerWatch.call(this, request, handler);
});

const roots: string[] = [];
const hosts: ProjectRevisions[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map(async (host) => host.release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  watched.length = 0;
});

const fileCount = 40;

const open = async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-feed-'));
  roots.push(workspaceRoot);
  for (let index = 0; index < fileCount; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await writeFile(join(workspaceRoot, `f${String(index)}.txt`), `file ${String(index)}\n`);
  }
  /* A current project carries both setup files; opening writes neither (A4), so the first save records them as they are. */
  await writeFile(join(workspaceRoot, generatedIgnorePath), generatedIgnoreContent(undefined));
  await writeFile(join(workspaceRoot, generatedGitattributesPath), generatedGitattributesContent(undefined));
  const reads: string[] = [];
  const disk = new NodeFsProvider(workspaceRoot);
  const counted = Object.assign(Object.create(disk) as NodeFsProvider, {
    readFileStream: (path: string, ...rest: unknown[]) => {
      reads.push(path);
      // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the provider's own overloads.
      return (disk.readFileStream as (...arguments_: any[]) => ReturnType<NodeFsProvider['readFileStream']>)(
        path,
        ...rest,
      );
    },
  });
  const port = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId: 'project-feed', root: () => new NodeFsProvider(workspaceRoot) },
  });
  const revisions = createProjectRevisions({
    via: 'desktop',
    workspaceRoot,
    projectId: 'project-feed',
    port,
    filesystem: () => counted,
  });
  hosts.push(revisions);
  await expect.poll(() => revisions.status().checkoutId, { timeout: 20_000 }).toBeDefined();
  /* A save that records, answered by the head moving. */
  const save = async (): Promise<string> => {
    const before = revisions.status().headRevisionId;
    await revisions.channel.request({ command: 'saveRevision' });
    await expect.poll(() => revisions.status().headRevisionId, { timeout: 20_000 }).not.toBe(before);
    return revisions.status().headRevisionId ?? '';
  };
  const contentAt = async (head: string, path: string): Promise<string | undefined> => {
    const tree = await port.readTree(revisionId(head));
    const bytes = tree?.get(path);
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  };
  return { workspaceRoot, reads, save, contentAt, revisions };
};

describe('the disk host’s change feed (E1)', () => {
  it('should re-read only the written file, and record a write the watcher had not reported yet', async () => {
    const host = await open();
    await host.save();

    await writeFile(join(host.workspaceRoot, 'f7.txt'), 'edited\n');
    host.reads.length = 0;
    /* Asked at once: the watcher's event for that write is still on its way. */
    const head = await host.save();

    expect(host.reads).toEqual(['f7.txt']);
    expect(await host.contentAt(head, 'f7.txt')).toBe('edited\n');
  }, 60_000);

  it('should read everything after the watcher loses track', async () => {
    const host = await open();
    await host.save();

    /* The platform lost the stream and cannot name what changed. */
    for (const handler of watched) {
      handler({ type: 'reset' });
    }
    await writeFile(join(host.workspaceRoot, 'f7.txt'), 'edited\n');
    host.reads.length = 0;
    await host.save();

    expect(host.reads.length).toBeGreaterThanOrEqual(fileCount);
  }, 60_000);

  /* #2285: Node's recursive `fs.watch` on Linux (before 24.22, Electron 43's
   * 24.21 among them) kept the replaced inode's watch after an atomic write,
   * so the next in-place write to that file never made the checkout dirty. */
  it('should call an in-place write dirty after the file was replaced by rename', async () => {
    const host = await open();
    await host.save();

    const temporary = join(host.workspaceRoot, '.f7.txt.1.00000000-0000-4000-8000-000000000000.tmp');
    await writeFile(temporary, 'replaced\n');
    await rename(temporary, join(host.workspaceRoot, 'f7.txt'));
    await host.save();
    expect(host.revisions.status().dirty).toBe(false);

    await writeFile(join(host.workspaceRoot, 'f7.txt'), 'edited in place\n');

    await expect.poll(() => host.revisions.status().dirty, { timeout: 1000 }).toBe(true);
  }, 60_000);
});
