import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { defaultPayloadStore } from '@taucad/host';
import { startNativeWorker } from '@taucad/native-process-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acpAdapterResolveFrom,
  agentWorkspaceRoot,
  childArguments,
  defaultServePort,
  parseAllowedOrigins,
  resolveServePort,
  serveNativeKernels,
  shouldOpenBrowser,
} from '#commands/serve.js';
import { exitCodes } from '#output.js';

const nativeKernels = vi.hoisted(() => ({
  composeNativeKernels: vi.fn<() => Promise<unknown>>(),
  verifyStoreClosure: vi.fn(async (_root: string, _signal: AbortSignal) => ({
    files: ['lib/python3.13/site-packages/build123d/__init__.pyc'],
    remedy: 'Run `tau prepare --verify` to repair it.',
  })),
  prepare: vi.fn(async (kernel: string) => ({ status: 'ready', kernel })),
  dispose: vi.fn(async () => undefined),
  opened: 0,
}));

vi.mock('#native-kernels.js', () => ({
  composeNativeKernels: nativeKernels.composeNativeKernels,
  verifyStoreClosure: nativeKernels.verifyStoreClosure,
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

describe('acpAdapterResolveFrom', () => {
  it('should resolve from the staged adapters of the package the module ships in', async () => {
    const root = await directory();
    await mkdir(join(root, 'dist/bin'), { recursive: true });
    await mkdir(join(root, 'dist-acp'));
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'dist-acp/package.json'), '{}');

    expect(acpAdapterResolveFrom(pathToFileURL(join(root, 'dist/bin/tau.mjs')).href)).toBe(
      pathToFileURL(join(root, 'dist-acp/package.json')).href,
    );
  });

  it('should fall back to the module itself, and look no further than its package', async () => {
    const outer = await directory();
    await mkdir(join(outer, 'dist-acp'));
    await writeFile(join(outer, 'dist-acp/package.json'), '{}');
    const root = join(outer, 'cli');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{}');
    const from = pathToFileURL(join(root, 'src/serve.ts')).href;

    expect(acpAdapterResolveFrom(from)).toBe(from);
  });
});

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

  it('should re-verify a closure for a child in this process, where the store is readable (X35)', async () => {
    const kernels = serveNativeKernels();
    const { signal } = new AbortController();

    await expect(kernels.native.verify('/store/closures/sha256/a', signal)).resolves.toEqual({
      files: ['lib/python3.13/site-packages/build123d/__init__.pyc'],
      remedy: 'Run `tau prepare --verify` to repair it.',
    });
    expect(nativeKernels.verifyStoreClosure).toHaveBeenCalledWith('/store/closures/sha256/a', signal);
  });

  it('should serve without native kernels, and start nothing, when the store cannot be composed', async () => {
    nativeKernels.composeNativeKernels.mockRejectedValue(new Error('TAU_ACQUISITION is "sometimes"'));
    const kernels = serveNativeKernels();

    await expect(kernels.native.compose()).resolves.toEqual({ unavailable: [] });
    await expect(kernels.native.closureRoots()).resolves.toEqual([]);
  });
});

describe('childArguments', () => {
  it('should hand a runtime child the locked profile as an argument, since its environment is minimal', () => {
    const base = { plugin: ['./p.mjs'], config: 'tau.config.mjs', zooProxyUrl: 'wss://api.example/v1/kernels/zoo' };

    expect(childArguments({ ...base, acquisition: 'open' })).toEqual([
      '--plugin=./p.mjs',
      '--config=tau.config.mjs',
      '--zoo-proxy-url=wss://api.example/v1/kernels/zoo',
    ]);
    expect(childArguments({ ...base, acquisition: 'locked' })).toContain('--acquisition=locked');
  });
});

describe('resolveServePort', () => {
  it('should take the stable default when it is free', async () => {
    await expect(resolveServePort({ port: undefined, strict: false, free: async () => true })).resolves.toBe(
      defaultServePort,
    );
  });

  it('should move to the next free port, or refuse under --strict-port', async () => {
    const taken = new Set([4000, 4001]);
    const free = async (port: number): Promise<boolean> => !taken.has(port);

    await expect(resolveServePort({ port: '4000', strict: false, free })).resolves.toBe(4002);
    await expect(resolveServePort({ port: '4000', strict: true, free })).rejects.toMatchObject({
      code: 'PORT_IN_USE',
      exit: exitCodes.refused,
    });
  });

  it('should pass 0 through for an ephemeral port and refuse a value that is not a port', async () => {
    await expect(resolveServePort({ port: 0, strict: false, free: async () => false })).resolves.toBe(0);
    await expect(resolveServePort({ port: '70000', strict: false })).rejects.toMatchObject({
      code: 'PORT_INVALID',
      exit: exitCodes.usage,
    });
  });
});

describe('shouldOpenBrowser', () => {
  const base = { open: undefined, ui: true, scripted: false, interactive: true, ci: false } as const;

  it('should open a served UI on an interactive terminal outside CI', () => {
    expect(shouldOpenBrowser(base)).toBe(true);
  });

  it.each([
    ['in CI', { ci: true }],
    ['off a terminal', { interactive: false }],
    ['when printing for a script', { scripted: true }],
    ['with no UI', { ui: false }],
    ['under --no-open', { open: false }],
  ])('should not open %s', (_label, change) => {
    expect(shouldOpenBrowser({ ...base, ...change })).toBe(false);
  });

  it('should open under --open even when printing', () => {
    expect(shouldOpenBrowser({ ...base, open: true, scripted: true, ci: true })).toBe(true);
  });
});

describe('parseAllowedOrigins', () => {
  it('should take exact origins, comma-separated or repeated, once each', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(['https://tau.new, http://localhost:3000', 'app://tau', 'https://tau.new'])).toEqual([
      'https://tau.new',
      'http://localhost:3000',
      'app://tau',
    ]);
  });

  it.each(['*', 'https://tau.new/', 'https://tau.new/w/project', 'HTTPS://TAU.NEW', 'tau.new', 'null'])(
    'should refuse %s, which no browser sends as its Origin',
    (origin) => {
      expect(() => parseAllowedOrigins(origin)).toThrow(expect.objectContaining({ code: 'ORIGIN_INVALID' }));
    },
  );

  it('should exit with the usage code', () => {
    expect(() => parseAllowedOrigins('*')).toThrow(expect.objectContaining({ exit: exitCodes.usage }));
  });
});
