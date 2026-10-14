import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { agentWorkspaceRoot } from '#commands/serve.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const directory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-serve-workspace-'));
  roots.push(root);
  return root;
};

describe('agentWorkspaceRoot', () => {
  it('should use a named workspace even inside a Git checkout', async () => {
    const root = await directory();
    await mkdir(join(root, '.git'));
    await mkdir(join(root, 'sub'));

    expect(agentWorkspaceRoot('sub', root)).toBe(join(process.cwd(), 'sub'));
    expect(agentWorkspaceRoot(join(root, 'sub'), join(root, 'sub'))).toBe(join(root, 'sub'));
  });

  it('should default to a current directory outside every Git checkout', async () => {
    const root = await directory();

    expect(agentWorkspaceRoot(undefined, root)).toBe(root);
  });

  it('should default to a Tau project even when it is a Git checkout', async () => {
    const root = await directory();
    await mkdir(join(root, '.git'));
    await writeFile(join(root, 'tau.json'), '{}\n');

    expect(agentWorkspaceRoot(undefined, root)).toBe(root);
  });

  it('should refuse to default to the root of a Git checkout or a worktree', async () => {
    const root = await directory();
    await writeFile(join(root, '.git'), 'gitdir: /elsewhere/.git/worktrees/root\n');

    expect(() => agentWorkspaceRoot(undefined, root)).toThrow(
      expect.objectContaining({
        code: 'WORKSPACE_REQUIRED',
        exit: 2,
        message: `The current directory is inside the Git checkout at ${root}, so tau serve will not default its workspace to it. Pass --workspace=<directory>: an empty directory for a new project, or this one to record Tau revisions in that repository.`,
      }),
    );
  });

  it('should refuse to default to a directory inside a Git checkout', async () => {
    const root = await directory();
    await mkdir(join(root, '.git'));
    await mkdir(join(root, 'packages', 'part'), { recursive: true });

    expect(() => agentWorkspaceRoot(undefined, join(root, 'packages', 'part'))).toThrow(
      `inside the Git checkout at ${root},`,
    );
  });
});
