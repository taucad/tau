/**
 * The disk host's change feed is complete (W4 a3, E1 on the native leg).
 *
 * A save re-reads only what the watcher named, and it still records a write
 * whose watcher event had not arrived when the save was asked for: the save
 * waits for the watcher first. A watcher that loses track makes the next save
 * read everything.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { createProjectRevisions } from '#revisions.js';
import type { ProjectRevisions } from '#revisions.js';

type WatchListener = nodeFs.WatchListener<string>;

/* Every listener the host hands `fs.watch`, so a row can speak for the platform. */
const watched = vi.hoisted((): WatchListener[] => []);

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  const recorded = (...arguments_: Parameters<typeof nodeFs.watch>): ReturnType<typeof nodeFs.watch> => {
    const listener = arguments_.at(-1);
    if (typeof listener === 'function') {
      watched.push(listener as WatchListener);
    }
    return actual.watch(...arguments_);
  };
  return { ...actual, watch: recorded };
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
  return { workspaceRoot, reads, save, contentAt };
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

    /* The platform could not name the file it saw change. */
    for (const listener of watched) {
      // oxlint-disable-next-line typescript/no-restricted-types -- the platform's own "no file name" is `null`.
      listener('rename', null);
    }
    await writeFile(join(host.workspaceRoot, 'f7.txt'), 'edited\n');
    host.reads.length = 0;
    await host.save();

    expect(host.reads.length).toBeGreaterThanOrEqual(fileCount);
  }, 60_000);
});
