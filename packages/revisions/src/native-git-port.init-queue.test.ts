/**
 * One `init` at a time per repository, across every port this process opens on it (tau #1282).
 *
 * A host opens one project from more than one place, and each place made its own port: the `init` queue was per port,
 * so two ports on the same repository each ran `git init` and `git lfs install --local` at once, and under git 2.43
 * the loser failed with "could not lock config file … File exists". The queue is now the process's, keyed by the
 * repository's canonical path, so a second port waits for the first and finds the store it made.
 */

import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* A project directory with no store yet, as a host's first open finds it. */
const freshRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-init-queue-'));
  roots.push(root);
  await mkdir(join(root, 'project'));
  return root;
};

describe.runIf(gitToolchainOnPath)('native-git init across ports on one repository', () => {
  it('should create the store once when many ports init the same repository at once', async () => {
    const rounds = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const repositoryPath = join(await freshRoot(), 'project');
        const ports = Array.from({ length: 4 }, () => createNativeGitRevisionPort({ repositoryPath }));
        return Promise.allSettled(ports.map(async (port) => port.init({ author })));
      }),
    );

    expect(rounds.flat().filter((result) => result.status === 'rejected')).toEqual([]);
  });

  it('should queue a port opened through a symlink with one opened on the real path', async () => {
    const rounds = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const root = await freshRoot();
        const repositoryPath = join(root, 'project');
        const linked = join(root, 'linked');
        await symlink(repositoryPath, linked);
        const ports = Array.from({ length: 4 }, (_, index) =>
          createNativeGitRevisionPort({ repositoryPath: index % 2 === 0 ? repositoryPath : linked }),
        );
        return Promise.allSettled(ports.map(async (port) => port.init({ author })));
      }),
    );

    expect(rounds.flat().filter((result) => result.status === 'rejected')).toEqual([]);
  });
});
