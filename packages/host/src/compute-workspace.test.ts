import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeStoreWorkspace } from '#compute-workspace.js';

const projectA = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const projectB = 'proj_BBBBBBBBBBBBBBBBBBBBB';

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'ignore',
  });
};

/** A project as Tau leaves it on disk: `tau.json` versioned, `.tau/*` ignored, identity in `.tau/project.json`. */
const makeProject = async (root: string, projectId: string | undefined): Promise<void> => {
  await mkdir(join(root, '.tau'), { recursive: true });
  await writeFile(join(root, 'tau.json'), '{}\n');
  await writeFile(join(root, '.gitignore'), '/.tau/*\n');
  if (projectId !== undefined) {
    await writeFile(join(root, '.tau', 'project.json'), `${JSON.stringify({ version: 1, projectId })}\n`);
  }
};

describe('computeStoreWorkspace', () => {
  let base: string;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'tau-compute-workspace-')));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('should key a project by its identity, not its path', async () => {
    const root = join(base, 'a');
    await makeProject(root, projectA);

    expect(computeStoreWorkspace(root)).toBe(`project:${projectA}`);
  });

  it('should give a plain copy of a project the store of the original', async () => {
    const root = join(base, 'a');
    await makeProject(root, projectA);
    await cp(root, join(base, 'copy'), { recursive: true });

    expect(computeStoreWorkspace(join(base, 'copy'))).toBe(computeStoreWorkspace(root));
  });

  it('should give a git worktree, which carries no identity, the store of its main worktree', async () => {
    const root = join(base, 'a');
    await makeProject(root, projectA);
    git(root, 'init', '-q');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    git(root, 'worktree', 'add', '-q', join(base, 'branch'));

    expect(computeStoreWorkspace(join(base, 'branch'))).toBe(`project:${projectA}`);
  });

  it('should keep a git worktree on its main worktree store after Tau minted the worktree its own identity', async () => {
    const root = join(base, 'a');
    await makeProject(root, projectA);
    git(root, 'init', '-q');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    const checkout = join(base, 'config', 'checkouts', projectA, 'turn');
    git(root, 'worktree', 'add', '-q', checkout);
    await makeProject(checkout, projectB);

    expect(computeStoreWorkspace(checkout)).toBe(`project:${projectA}`);
  });

  it('should map a project nested in a repository to the same folder of the main worktree', async () => {
    const repository = join(base, 'repo');
    await makeProject(join(repository, 'projects', 'a'), projectA);
    await makeProject(join(repository, 'projects', 'b'), projectB);
    git(repository, 'init', '-q');
    git(repository, 'add', '.');
    git(repository, 'commit', '-qm', 'init');
    git(repository, 'worktree', 'add', '-q', join(base, 'branch'));

    expect(computeStoreWorkspace(join(base, 'branch', 'projects', 'a'))).toBe(`project:${projectA}`);
    expect(computeStoreWorkspace(join(base, 'branch', 'projects', 'b'))).toBe(`project:${projectB}`);
  });

  it('should keep different projects apart', async () => {
    await makeProject(join(base, 'a'), projectA);
    await makeProject(join(base, 'b'), projectB);

    expect(computeStoreWorkspace(join(base, 'a'))).not.toBe(computeStoreWorkspace(join(base, 'b')));
  });

  it('should fall back to the root as given when no identity resolves', async () => {
    const root = join(base, 'unmarked');
    await makeProject(root, undefined);
    await writeFile(join(root, '.tau', 'project.json'), '{"version":1,"projectId":"not-an-id"}\n');

    expect(computeStoreWorkspace(root)).toBe(root);
    expect(computeStoreWorkspace(join(base, 'missing'))).toBe(join(base, 'missing'));
    expect(computeStoreWorkspace('/projects/a')).toBe('/projects/a');
  });
});
