import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultPayloadStore } from '@taucad/host';
import { startNativeWorker } from '@taucad/native-process-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentWorkspaceRoot, serveNativeKernels } from '#commands/serve.js';

const nativeKernels = vi.hoisted(() => ({
  composeNativeKernels: vi.fn<() => Promise<unknown>>(),
  prepare: vi.fn(async (kernel: string) => ({ status: 'ready', kernel })),
  dispose: vi.fn(async () => undefined),
  opened: 0,
}));

vi.mock('#native-kernels.js', () => ({
  composeNativeKernels: nativeKernels.composeNativeKernels,
  openNativePreparation: () => {
    nativeKernels.opened += 1;
    return { prepare: nativeKernels.prepare, dispose: nativeKernels.dispose };
  },
}));

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

describe('serveNativeKernels', () => {
  const context = { signal: new AbortController().signal, onProgress: () => undefined };

  it('should compose each child from the store, start workers only from its sealed closures, and prepare in this process once opened', async () => {
    nativeKernels.composeNativeKernels.mockResolvedValue({
      unavailable: [],
      closureRoots: ['/store/closures/sha256/a'],
    });
    const kernels = serveNativeKernels();

    await expect(kernels.native.compose()).resolves.toEqual({
      unavailable: [],
      closureRoots: ['/store/closures/sha256/a'],
    });
    await expect(kernels.native.closureRoots()).resolves.toEqual(['/store/closures/sha256/a']);
    expect(kernels.native.start).toBe(startNativeWorker);
    /* The broker resolves the store's real path itself, so a store under a link launches (macOS's `/tmp`). */
    expect(kernels.native.store).toBe(defaultPayloadStore());
    await kernels.dispose();
    expect(nativeKernels.opened).toBe(0);

    await expect(kernels.prepareKernel({ kernel: 'picogk' }, context)).resolves.toEqual({
      status: 'ready',
      kernel: 'picogk',
    });
    await kernels.prepareKernel({ kernel: 'build123d' }, context);
    await kernels.dispose();

    expect(nativeKernels.opened).toBe(1);
    expect(nativeKernels.prepare).toHaveBeenCalledWith('build123d', context);
    expect(nativeKernels.dispose).toHaveBeenCalledOnce();
  });

  it('should serve without native kernels, and start nothing, when the store cannot be composed', async () => {
    nativeKernels.composeNativeKernels.mockRejectedValue(new Error('TAU_ACQUISITION is "sometimes"'));
    const kernels = serveNativeKernels();

    await expect(kernels.native.compose()).resolves.toEqual({ unavailable: [] });
    await expect(kernels.native.closureRoots()).resolves.toEqual([]);
  });
});
