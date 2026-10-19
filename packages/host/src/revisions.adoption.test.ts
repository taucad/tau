/**
 * A disk host's close revision over a repository the person made (rules 4, 5 and 13).
 *
 * Before adoption was its own mode, `tau serve` started in a checkout committed
 * the person's ignored build output and secrets, converted their images to LFS
 * pointers, and cut every worktree they had made at close. The close revision
 * now records exactly what their own `git add --all` would, onto their branch,
 * and leaves every other worktree alone.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProjectRevisions, requireRevisionToolchain } from '#revisions.js';

const roots: string[] = [];

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* The same `git` + `git lfs` probe the host refuses on (OQ-B8). */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

describe.runIf(gitToolchainOnPath)('close revision of an adopted repository', () => {
  it("should record what the person's own Git would and leave their other worktrees alone", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-host-adopted-'));
    roots.push(root);
    process.env['TAU_CONFIG_DIR'] = join(root, 'config');
    const project = join(root, 'project');
    await mkdir(project);
    git(project, ['init', '--quiet', '--initial-branch=main']);
    await writeFile(join(project, '.gitignore'), 'dist/\n.env\n');
    await writeFile(join(project, 'part.scad'), 'cube(1);\n');
    await writeFile(join(project, 'photo.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    git(project, ['add', '--all']);
    git(project, ['commit', '--quiet', '-m', 'Mine']);
    git(project, ['worktree', 'add', '--quiet', '-b', 'side', join(root, 'mine')]);
    await writeFile(join(root, 'mine', 'draft.scad'), 'sphere(1);\n');
    const photo = git(project, ['rev-parse', 'HEAD:photo.png']);
    // The person's untracked work, their build output and a secret.
    await writeFile(join(project, 'bracket.scad'), 'cube(2);\n');
    await mkdir(join(project, 'dist'));
    await writeFile(join(project, 'dist', 'bundle.js'), 'built\n');
    await writeFile(join(project, '.env'), 'SECRET=1\n');

    const revisions = createProjectRevisions({ workspaceRoot: project, projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA' });
    try {
      await vi.waitFor(() => {
        expect(revisions.status().registrySettled).toBe(true);
      });
    } finally {
      await revisions.release();
    }

    expect(git(project, ['log', '--format=%s', 'main'])).toBe('Saved changes (close)\nMine');
    expect(git(project, ['ls-tree', '-r', '--name-only', 'main']).split('\n')).toStrictEqual([
      '.gitignore',
      'bracket.scad',
      'part.scad',
      'photo.png',
    ]);
    expect(git(project, ['rev-parse', 'main:photo.png'])).toBe(photo);
    expect(await readFile(join(project, '.gitignore'), 'utf8')).toBe('dist/\n.env\n');
    expect(git(project, ['status', '--porcelain'])).toBe('');
    expect(git(project, ['log', '--format=%s', 'side'])).toBe('Mine');
    expect(git(join(root, 'mine'), ['status', '--porcelain'])).toBe('?? draft.scad');
  }, 120_000);
});
