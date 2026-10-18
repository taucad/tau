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
  handOffLink,
  handOffTarget,
  parseAllowedOrigins,
  prepareStoreUi,
  resolveServePort,
  serveNativeKernels,
  serveUiChoice,
  shouldOpenBrowser,
} from '#commands/serve.js';
import type { prepareServeUi } from '#serve-ui.js';
import { exitCodes } from '#output.js';

/* Vitest's `NODE_ENV=test` drops consola to `warn`; the progress lines asserted below are `info`. */
vi.hoisted(() => {
  process.env['CONSOLA_LEVEL'] = '3';
});

const nativeKernels = vi.hoisted(() => ({
  inspectReportedClosure: vi.fn(async (_request: unknown) => ({
    answer: { status: 'ready', closures: {} },
    roots: ['/store/closures/sha256/a'],
  })),
  reports: [] as unknown[],
  verifyStoreClosure: vi.fn(async (_root: string, _signal: AbortSignal) => ({
    files: ['lib/python3.13/site-packages/build123d/__init__.pyc'],
    remedy: 'Run `tau prepare --verify` to repair it.',
  })),
  prepare: vi.fn(async (kernel: string, _context: unknown) => ({ status: 'ready', kernel })),
  dispose: vi.fn(async () => undefined),
  opened: 0,
}));

/* Each report row declares the kernels it lists; this CLI ships `@taucad/*` in the fixture. */
type Row = { readonly package: string; readonly kernels: readonly string[] };
vi.mock('#native-kernels.js', () => ({
  inspectReportedClosure: nativeKernels.inspectReportedClosure,
  verifyStoreClosure: nativeKernels.verifyStoreClosure,
  preparableKernelsOf: (report: readonly Row[]) =>
    report.flatMap(({ kernels }) => kernels.map((kernel) => ({ kernel, extensions: ['x'] }))),
  shippedDeploymentsOf: async (report: readonly Row[]) => report.filter((row) => row.package.startsWith('@taucad/')),
  shippedKernelsOf: async (report: readonly Row[]) =>
    new Set(report.filter((row) => row.package.startsWith('@taucad/')).flatMap(({ kernels }) => kernels)),
  openNativePreparation: (options: { readonly deployments: () => Promise<unknown> }) => {
    nativeKernels.opened += 1;
    return {
      prepare: async (kernel: string, context: unknown) => {
        nativeKernels.reports.push(await options.deployments());
        return nativeKernels.prepare(kernel, context);
      },
      dispose: nativeKernels.dispose,
    };
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
  const row = (name: string, kernel: string) => ({
    package: name,
    entry: `file:///${kernel}/src/native.ts`,
    packageRoot: `file:///${kernel}/`,
    manifest: {},
    kernels: [kernel],
  });
  const report = [row('@taucad/build123d', 'build123d'), row('@acme/rustcad', 'rustcad')];
  /* The report is read once its module loads, so wait for the kernels to be named. */
  const reported = async (kernels: ReturnType<typeof serveNativeKernels>): Promise<void> => {
    kernels.native.reported?.(report);
    await vi.waitFor(() => {
      expect(kernels.preparableKernels()).toHaveLength(2);
    });
  };

  it("should answer a child's closure request from its data, name the kernels it reports, and prepare in this process once opened", async () => {
    const kernels = serveNativeKernels();
    const request = {
      package: '@taucad/build123d',
      kernel: 'build123d',
      dependencies: ['engine'],
      manifest: {},
      packageRoot: 'file:///build123d/',
    };

    await expect(kernels.native.inspect(request)).resolves.toEqual({
      answer: { status: 'ready', closures: {} },
      roots: ['/store/closures/sha256/a'],
    });
    expect(nativeKernels.inspectReportedClosure).toHaveBeenCalledWith(request);
    expect(kernels.native.start).toBe(startNativeWorker);
    /* The broker resolves the store's real path itself, so a store under a link launches (macOS's `/tmp`). */
    expect(kernels.native.store).toBe(defaultPayloadStore());
    expect(kernels.preparableKernels()).toEqual([]);
    await reported(kernels);
    expect(kernels.preparableKernels().map(({ kernel }) => kernel)).toEqual(['build123d', 'rustcad']);
    await kernels.dispose();
    expect(nativeKernels.opened).toBe(0);

    await expect(kernels.prepareKernel({ kernel: 'build123d' }, context)).resolves.toEqual({
      status: 'ready',
      kernel: 'build123d',
    });
    await kernels.dispose();

    expect(nativeKernels.opened).toBe(1);
    expect(nativeKernels.prepare).toHaveBeenCalledWith('build123d', context);
    /* Only the deployments this CLI ships are imported here: a child runs project code. */
    expect(nativeKernels.reports).toEqual([[report[0]]]);
    expect(nativeKernels.dispose).toHaveBeenCalledOnce();
  });

  it('should not prepare a kernel from a plugin this CLI does not ship, and name the command that does', async () => {
    const kernels = serveNativeKernels();
    await reported(kernels);

    await expect(kernels.prepareKernel({ kernel: 'rustcad' }, context)).resolves.toMatchObject({
      status: 'failed',
      kernel: 'rustcad',
      code: 'KERNEL_NOT_SHIPPED',
      message: expect.stringContaining('tau prepare rustcad') as unknown,
    });
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

  it('should ignore a report that does not parse', async () => {
    const kernels = serveNativeKernels();
    kernels.native.reported?.([{ package: 5 }]);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(kernels.preparableKernels()).toEqual([]);
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

describe('handOffTarget', () => {
  it('should admit Tau Desktop for desktop, and one website origin otherwise', () => {
    expect(handOffTarget('desktop')).toEqual({ kind: 'desktop', origin: 'app://tau' });
    expect(handOffTarget('https://tau.new')).toEqual({ kind: 'website', origin: 'https://tau.new' });
    expect(handOffTarget(undefined)).toBeUndefined();
    expect(handOffTarget('')).toBeUndefined();
  });

  it.each(['https://tau.new/', 'app://tau', 'https://tau.new,https://taucad.dev', '*'])(
    'should refuse %s as a usage error',
    (value) => {
      expect(() => handOffTarget(value)).toThrow(
        expect.objectContaining({ code: 'ORIGIN_INVALID', exit: exitCodes.usage }),
      );
    },
  );
});

describe('handOffLink', () => {
  it('should name the loopback origin and the code in a tau://host link for the desktop', () => {
    expect(handOffLink({ kind: 'desktop', origin: 'app://tau' }, 'http://127.0.0.1:7180/', 'c0de_-x')).toBe(
      'tau://host/http://127.0.0.1:7180?code=c0de_-x',
    );
  });

  it('should carry both in the fragment for a website, where its server never sees them', () => {
    const link = new URL(handOffLink({ kind: 'website', origin: 'https://tau.new' }, 'http://127.0.0.1:7180/', 'c0de'));

    expect(link.origin).toBe('https://tau.new');
    expect(link.search).toBe('');
    expect(Object.fromEntries(new URLSearchParams(link.hash.slice(1)))).toEqual({
      'tau-host': 'http://127.0.0.1:7180',
      'tau-code': 'c0de',
    });
  });
});

describe('serveUiChoice', () => {
  it('should serve the pinned layer by default, a directory when named, and none under --no-ui', () => {
    expect(serveUiChoice(undefined)).toEqual({ kind: 'store' });
    expect(serveUiChoice('')).toEqual({ kind: 'store' });
    expect(serveUiChoice('./tau-ui')).toEqual({ kind: 'directory', directory: './tau-ui' });
    expect(serveUiChoice(false)).toEqual({ kind: 'none' });
    expect(serveUiChoice('false')).toEqual({ kind: 'none' });
  });
});

describe('prepareStoreUi', () => {
  it('should say what it downloads, every tenth of the bytes, and that it sealed the layer', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const prepare = vi.fn<typeof prepareServeUi>(async ({ onProgress }) => {
      for (const completedBytes of [0, 5_000_000, 12_000_000, 13_000_000, 120_000_000]) {
        onProgress?.({ completedBytes, totalBytes: 120_000_000 });
      }
      return { status: 'ready', root: '/store/closures/sha256/a/client', closureIntegrity: 'sha256-a' };
    });
    try {
      await expect(prepareStoreUi({ prepare })).resolves.toMatchObject({ status: 'ready' });
      const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');

      expect(written).toContain('Downloading the Tau UI (120.0 MB, once; verified against its pinned digest)');
      expect(written).toContain('Tau UI: 12.0 MB of 120.0 MB (10%)');
      expect(written).not.toContain('13.0 MB');
      expect(written).toContain('Tau UI: 120.0 MB of 120.0 MB (100%)');
      expect(written).toContain('The Tau UI is verified and sealed in the payload store.');
    } finally {
      stderr.mockRestore();
    }
  });

  it('should say nothing for a layer already sealed, and hand back why there is none', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const unpublished = {
      status: 'unavailable',
      reason: 'unpublished',
      message: 'This release of the Tau CLI pins no published Tau UI yet.',
    } as const;
    try {
      await expect(
        prepareStoreUi({ prepare: async () => ({ status: 'ready', root: '/r', closureIntegrity: 'sha256-a' }) }),
      ).resolves.toMatchObject({ status: 'ready' });
      await expect(
        prepareStoreUi({
          prepare: async ({ onProgress }) => {
            onProgress?.({ completedBytes: 0, totalBytes: 0 });
            return unpublished;
          },
        }),
      ).resolves.toEqual(unpublished);
      await expect(prepareStoreUi()).resolves.toEqual(unpublished);
      expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).not.toContain('sealed');
    } finally {
      stderr.mockRestore();
    }
  });
});
