import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestAction, digestContent } from '@taucad/cache-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createComputeStoreHost } from '#compute-store.js';
import type { ComputeStoreHost } from '#compute-store.js';

const makeEntry = async (content: string) => {
  const action = {
    schemaVersion: 1,
    namespace: 'cli-compute-host',
    producer: {
      id: 'cli-compute-host-test',
      version: '1.0.0',
      implementationAssets: [],
    },
    operation: 'build',
    inputs: [],
    arguments: { content },
    environment: {},
    codec: { id: 'raw', version: '1' },
  } as const;
  const bytes = new TextEncoder().encode(content);
  return {
    action,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes }),
    mediaType: 'application/octet-stream',
    bytes,
    determinism: 'byte-exact',
  } as const;
};

/** A Tau project on disk, `.tau/*` unversioned, with its generated identity unless `projectId` is omitted. */
const makeProject = async (root: string, projectId?: string): Promise<void> => {
  await mkdir(join(root, '.tau'), { recursive: true });
  await writeFile(join(root, 'tau.json'), '{}\n');
  await writeFile(join(root, '.gitignore'), '/.tau/*\n');
  if (projectId !== undefined) {
    await writeFile(join(root, '.tau', 'project.json'), `${JSON.stringify({ version: 1, projectId })}\n`);
  }
};

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'ignore',
  });
};

describe('createComputeStoreHost', () => {
  let directory: string | undefined;
  let host: ComputeStoreHost | undefined;

  afterEach(async () => {
    await host?.close();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should start no worker until a project connects, then keep one connection per project', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    const onError = vi.fn();
    host = createComputeStoreHost({ directory: join(directory, 'compute'), onError });

    await expect(readdir(directory)).resolves.toEqual([]);

    const first = host.connect('/projects/a');
    expect(host.connect('/projects/a')).toBe(first);
    const other = host.connect('/projects/b');
    expect(other).not.toBe(first);

    const [a, b] = await Promise.all([first.control.inspect({}), other.control.inspect({})]);
    expect(a.generation).toBe(b.generation);
    await expect(readdir(join(directory, 'compute'))).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.sqlite$/u)]),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('should keep a project store across a restart of the process that holds it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    const options = { directory: join(directory, 'compute'), onError: vi.fn() };
    host = createComputeStoreHost(options);
    const cleared = await host.connect('/projects/a').control.clear({});
    await host.close();

    host = createComputeStoreHost(options);
    const reopened = await host.connect('/projects/a').control.inspect({});

    expect(reopened.generation).toBe(cleared.generation);
  });

  it('should replace a stopped worker on the next connection', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    host = createComputeStoreHost({ directory: join(directory, 'compute'), onError: vi.fn() });
    const before = host.connect('/projects/a');
    await before.control.inspect({});
    await host.close();

    const after = host.connect('/projects/a');

    expect(after).not.toBe(before);
    await expect(after.control.inspect({})).resolves.toHaveProperty('generation');
  });

  it('should serve a build stored from one root of a project as a hit from its worktree, a checkout and a copy', async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-')));
    const root = join(directory, 'project');
    await makeProject(root, 'proj_AAAAAAAAAAAAAAAAAAAAA');
    git(root, 'init', '-q');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    const worktree = join(directory, 'project-feature');
    git(root, 'worktree', 'add', '-q', worktree);
    const checkout = join(directory, 'config', 'checkouts', 'proj_AAAAAAAAAAAAAAAAAAAAA', 'turn');
    git(root, 'worktree', 'add', '-q', checkout);
    const copy = join(directory, 'project-copy');
    await cp(root, copy, { recursive: true });
    const other = join(directory, 'other');
    await makeProject(other, 'proj_BBBBBBBBBBBBBBBBBBBBB');
    const unmarked = join(directory, 'unmarked');
    await makeProject(unmarked);
    const options = { directory: join(directory, 'compute'), onError: vi.fn() };
    const entry = await makeEntry('a built model');

    host = createComputeStoreHost(options);
    const writer = await host.connect(root).engine.open({ workspace: 'ignored' });
    await expect(
      writer.put({
        entries: [entry],
        generation: writer.generation,
        durability: 'disposable',
      }),
    ).resolves.toMatchObject({ status: 'committed' });
    await writer.close();
    await host.close();

    host = createComputeStoreHost(options);
    const lookup = async (projectRoot: string) => {
      const reader = await host!.connect(projectRoot).engine.open({ workspace: 'ignored' });
      try {
        const result = await reader.get({
          digests: [entry.actionDigest],
          maxEntries: 1,
          maxBytes: 1024,
          generation: reader.generation,
        });
        return result.status === 'ok' ? result.entries.length : -1;
      } finally {
        await reader.close();
      }
    };

    expect(host.connect(worktree)).toBe(host.connect(root));
    await expect(lookup(worktree)).resolves.toBe(1);
    await expect(lookup(checkout)).resolves.toBe(1);
    await expect(lookup(copy)).resolves.toBe(1);
    await expect(lookup(other)).resolves.toBe(0);
    await expect(lookup(unmarked)).resolves.toBe(0);
    expect(options.onError).not.toHaveBeenCalled();
  });
});
