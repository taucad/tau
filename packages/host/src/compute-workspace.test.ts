import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
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

  describe("when a folder tries to choose another project's store", () => {
    /* A project the person owns, with its own repository. */
    const makeVictim = async (): Promise<string> => {
      const victim = join(base, 'victim');
      await makeProject(victim, projectA);
      git(victim, 'init', '-q');
      git(victim, 'add', '.');
      git(victim, 'commit', '-qm', 'init');
      return victim;
    };

    it('should refuse a forged .git file whose commondir names another repository', async () => {
      const victim = await makeVictim();
      const forged = join(base, 'downloads', 'forged');
      await mkdir(join(forged, 'admin'), { recursive: true });
      await writeFile(join(forged, '.git'), 'gitdir: admin\n');
      await writeFile(join(forged, 'admin', 'commondir'), `${join(victim, '.git')}\n`);

      expect(computeStoreWorkspace(forged)).toBe(forged);
    });

    it('should refuse a forged admin directory inside the real worktrees folder that does not point back here', async () => {
      const victim = await makeVictim();
      git(victim, 'worktree', 'add', '-q', join(base, 'branch'));
      const forged = join(base, 'downloads', 'forged');
      await mkdir(forged, { recursive: true });
      await writeFile(join(forged, '.git'), `gitdir: ${join(victim, '.git', 'worktrees', 'branch')}\n`);

      expect(computeStoreWorkspace(forged)).toBe(forged);
    });

    it('should refuse a .tau directory symlinked to another project', async () => {
      const victim = await makeVictim();
      const borrowed = join(base, 'downloads', 'borrowed');
      await mkdir(borrowed, { recursive: true });
      await symlink(join(victim, '.tau'), join(borrowed, '.tau'));

      expect(computeStoreWorkspace(borrowed)).toBe(borrowed);
    });

    it('should stop at a .git symlink instead of adopting an outer worktree', async () => {
      const victim = await makeVictim();
      const outer = join(base, 'outer');
      git(victim, 'worktree', 'add', '-q', outer);
      await makeProject(join(victim, 'nested'), projectB);
      const other = join(base, 'other');
      await mkdir(other, { recursive: true });
      git(other, 'init', '-q');
      const inner = join(outer, 'nested');
      await mkdir(inner, { recursive: true });
      await symlink(join(other, '.git'), join(inner, '.git'));

      expect(computeStoreWorkspace(inner)).toBe(inner);
    });

    it('should still give a real linked worktree its main worktree store, also through a symbolic link', async () => {
      const victim = await makeVictim();
      git(victim, 'worktree', 'add', '-q', join(base, 'branch'));
      await symlink(join(base, 'branch'), join(base, 'branch-link'));

      expect(computeStoreWorkspace(join(base, 'branch'))).toBe(`project:${projectA}`);
      expect(computeStoreWorkspace(join(base, 'branch-link'))).toBe(`project:${projectA}`);
    });
  });
});
