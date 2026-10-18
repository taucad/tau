import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  computeClosureIntegrity,
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
} from '@taucad/runtime/preparation/node';
import type {
  ClosureReceipt,
  DependencyPayload,
  DependencyTarget,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';
import { cloneTree, openDesktopPreparationHost, seedNativeStore, startNativeStore } from '#tau/native-store.js';

const packageName = '@taucad/demo-native';
const files = { 'worker.py': 'print("ready")\n', 'model.py': 'WIDTH = 20\n' } as const;

/** The variant this machine selects: the closure is the same bytes whatever the host, only the target differs. */
const hostTarget = (): DependencyTarget => {
  const host = detectHostIndicators();
  if (host === undefined || host.os === 'win32') {
    throw new Error('These tests seed a native closure, which only macOS and Linux hosts select.');
  }
  return host.os === 'linux'
    ? { runtime: 'native', os: 'linux', arch: host.arch, libc: host.libc ?? 'glibc' }
    : { runtime: 'native', os: 'darwin', arch: host.arch };
};

const payloadOf = (name: keyof typeof files): DependencyPayload => {
  const bytes = Buffer.from(files[name]);
  return {
    name,
    integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
    byteLength: bytes.byteLength,
    format: 'raw',
    origin: { kind: 'packagePath', path: `payloads/${name}` },
    destination: 'worker',
  };
};

let root: string;
let plugin: PreparationPlugin;
let bundle: string;
let store: string;

/** Seal the closure as a packaging machine does, into a producer store, and ship its `closures/` tree. */
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'tau-desktop-seed-')));
  const directory = join(root, 'package');
  await mkdir(join(directory, 'payloads'), { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => writeFile(join(directory, 'payloads', name), text)),
  );
  plugin = {
    package: packageName,
    directory,
    deployment: parsePluginDeployment({
      schemaVersion: 1,
      dependencies: { engine: [{ target: hostTarget(), payloads: [payloadOf('worker.py'), payloadOf('model.py')] }] },
      kernels: { demo: { requires: ['engine'], extensions: ['py'] } },
    }),
  };
  const producer = createPreparationHost({ plugins: [plugin], store: join(root, 'producer'), hostPath: directory });
  try {
    const outcome = await producer.prepare({
      package: packageName,
      offline: true,
      signal: AbortSignal.timeout(30_000),
    });
    expect(outcome.status).toBe('ready');
  } finally {
    producer.dispose();
  }
  bundle = join(root, 'Tau.app', 'Contents', 'Resources', 'payloads');
  await mkdir(bundle, { recursive: true });
  await cp(join(root, 'producer', 'closures'), join(bundle, 'closures'), { recursive: true });
  store = join(root, 'store');
  await mkdir(store);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const openHost = () =>
  openDesktopPreparationHost({
    store,
    hostPath: join(root, 'Tau.app'),
    managed: { profile: 'open', selection: {}, offline: false },
    plugins: [plugin],
  });

const bundledClosure = async (): Promise<string> => {
  const [key] = await readdir(join(bundle, 'closures', 'sha256'));
  return join(bundle, 'closures', 'sha256', key!);
};

describe.each([
  { mode: 'native', scenario: 'mixed modes', sealed: false, forceFallback: false, partial: false },
  { mode: 'Darwin plain-copy fallback', scenario: 'mixed modes', sealed: false, forceFallback: true, partial: false },
  { mode: 'native', scenario: 'read-only source', sealed: true, forceFallback: false, partial: false },
  {
    mode: 'Darwin plain-copy fallback',
    scenario: 'read-only source',
    sealed: true,
    forceFallback: true,
    partial: false,
  },
  {
    mode: 'Darwin partial-copy fallback',
    scenario: 'read-only source',
    sealed: true,
    forceFallback: true,
    partial: true,
  },
])('cloneTree $mode with $scenario', ({ forceFallback, sealed, partial }) => {
  it.skipIf(forceFallback && process.platform !== 'darwin')(
    'should preserve sealed modes and symlinks under a restrictive child umask',
    async () => {
      const source = join(root, 'mode-source');
      const target = join(root, 'mode-target');
      await mkdir(join(source, 'nested'), { recursive: true });
      await writeFile(join(source, 'data'), 'sealed data');
      await writeFile(join(source, 'nested', 'executable'), 'sealed executable');
      await writeFile(join(source, 'private'), 'private data');
      await symlink('data', join(source, 'alias'));
      const modes = [
        ['', sealed ? 0o555 : 0o755],
        ['nested', sealed ? 0o555 : 0o750],
        ['data', sealed ? 0o444 : 0o644],
        ['nested/executable', sealed ? 0o555 : 0o755],
        ['private', sealed ? 0o400 : 0o600],
      ] as const;
      try {
        await Promise.all(modes.map(async ([path, mode]) => chmod(join(source, path), mode)));
        // Only the disposable child changes its mask; parallel tests and the application retain theirs.
        const { stdout } = await promisify(execFile)(
          process.execPath,
          [
            '--import',
            'tsx',
            '--input-type=module',
            '--eval',
            `process.umask(0o077);
         if (process.argv[5] === 'true') {
           const fs = await import('node:fs/promises');
           const path = await import('node:path');
           await fs.mkdir(path.join(process.argv[3], 'partial'), { recursive: true });
           await fs.writeFile(path.join(process.argv[3], 'partial', 'debris'), 'unfinished copy');
           await fs.symlink(process.argv[2], path.join(process.argv[3], 'outward'));
           await fs.symlink(path.join(process.argv[2], 'missing'), path.join(process.argv[3], 'dangling'));
           await fs.chmod(path.join(process.argv[3], 'partial'), 0o555);
           await fs.chmod(process.argv[3], 0o555);
         }
         if (process.argv[4] === 'true') {
           const { default: childProcess } = await import('node:child_process');
           const { syncBuiltinESMExports } = await import('node:module');
           const original = childProcess.execFile;
           childProcess.execFile = (file, args, ...rest) =>
             file === '/bin/cp' && args.includes('-c')
               ? original('/usr/bin/false', [], ...rest)
               : original(file, args, ...rest);
           syncBuiltinESMExports();
         }
         const { cloneTree } = await import(process.argv[1]);
         console.log(await cloneTree(process.argv[2], process.argv[3]));`,
            new URL('native-store.ts', import.meta.url).href,
            source,
            target,
            String(forceFallback),
            String(partial),
          ],
          { timeout: 10_000 },
        );
        if (forceFallback) {
          expect(stdout.trim()).toBe('copy');
        } else if (process.platform === 'darwin') {
          expect(['clone', 'copy']).toContain(stdout.trim());
        } else {
          expect(stdout.trim()).toBe('clone');
        }
        await Promise.all(
          modes.map(async ([path, mode]) => {
            const [copied, original] = await Promise.all([stat(join(target, path)), stat(join(source, path))]);
            expect(copied.mode % 0o1000).toBe(mode);
            expect(original.mode % 0o1000).toBe(mode);
          }),
        );
        const targetEntries = await readdir(target);
        expect(targetEntries.sort()).toEqual(['alias', 'data', 'nested', 'private']);
        expect(await readFile(join(target, 'data'), 'utf8')).toBe('sealed data');
        expect(await readFile(join(target, 'nested', 'executable'), 'utf8')).toBe('sealed executable');
        expect(await readFile(join(target, 'private'), 'utf8')).toBe('private data');
        expect(await readlink(join(target, 'alias'))).toBe('data');
        expect(await readlink(join(source, 'alias'))).toBe('data');
        expect(await readFile(join(source, 'data'), 'utf8')).toBe('sealed data');
        expect(await readFile(join(source, 'nested', 'executable'), 'utf8')).toBe('sealed executable');
        expect(await readFile(join(source, 'private'), 'utf8')).toBe('private data');
      } finally {
        // Restore only disposable directories after assertions, so non-root cleanup can unlink sealed files.
        await Promise.all(
          [source, join(source, 'nested'), target, join(target, 'nested'), join(target, 'partial')].map(
            async (directory) => {
              try {
                await chmod(directory, 0o700);
              } catch (error) {
                // A failed copy may not have created every destination directory.
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
                  throw error;
                }
              }
            },
          ),
        );
      }
    },
    15_000,
  );
});

describe('seedNativeStore', () => {
  it.each(['partial tree', 'unreadable partial tree', 'root symlink', 'dangling root symlink'] as const)(
    'should discard a failed %s without changing the source or masking the copy error',
    async (scenario) => {
      const host = openHost();
      const source = await bundledClosure();
      const sourceStat = await stat(source);
      const workerStat = await stat(join(source, 'worker'));
      const sourceMode = sourceStat.mode;
      const workerMode = workerStat.mode;
      await chmod(source, 0o555);
      await chmod(join(source, 'worker'), 0o555);
      const sentinel = new Error('Injected partial copy failure');
      const clone: typeof cloneTree = async (_source, target) => {
        if (scenario === 'partial tree' || scenario === 'unreadable partial tree') {
          await mkdir(join(target, 'sealed'), { recursive: true });
          await writeFile(join(target, 'sealed', 'partial'), 'unfinished');
          await symlink(source, join(target, 'outward'));
          await symlink(join(source, 'missing'), join(target, 'dangling'));
          await chmod(join(target, 'sealed'), scenario === 'unreadable partial tree' ? 0o111 : 0o555);
          await chmod(target, 0o555);
        } else {
          await symlink(scenario === 'root symlink' ? source : join(source, 'missing'), target);
        }
        throw sentinel;
      };
      try {
        await expect(seedNativeStore({ host, store, bundle, signal: AbortSignal.timeout(30_000), clone })).rejects.toBe(
          sentinel,
        );
        expect(await readdir(join(store, 'tmp'))).toEqual([]);
        const retainedSourceStat = await stat(source);
        const retainedWorkerStat = await stat(join(source, 'worker'));
        expect(retainedSourceStat.mode % 0o1000).toBe(0o555);
        expect(retainedWorkerStat.mode % 0o1000).toBe(0o555);
        expect(await readFile(join(source, 'worker', 'model.py'), 'utf8')).toBe(files['model.py']);
        const inspected = await host.inspect({ package: packageName });
        expect(inspected.state.status).toBe('idle');
      } finally {
        await chmod(source, sourceMode);
        await chmod(join(source, 'worker'), workerMode);
        host.dispose();
      }
    },
  );

  it('should refuse a tampered sealed copy and remove its staging tree', async () => {
    const host = openHost();
    const clone: typeof cloneTree = async (source, target) => {
      await cp(source, target, { recursive: true });
      await writeFile(join(target, 'worker', 'model.py'), 'WIDTH = 2000\n');
      await chmod(join(target, 'worker'), 0o555);
      await chmod(target, 0o555);
      return 'copy';
    };
    try {
      const outcomes = await seedNativeStore({ host, store, bundle, signal: AbortSignal.timeout(30_000), clone });
      expect(outcomes).toMatchObject([{ status: 'refused', files: ['worker/model.py'] }]);
      expect(await readdir(join(store, 'tmp'))).toEqual([]);
      const inspected = await host.inspect({ package: packageName });
      expect(inspected.state.status).toBe('idle');
      expect(await readFile(join(await bundledClosure(), 'worker', 'model.py'), 'utf8')).toBe(files['model.py']);
    } finally {
      host.dispose();
    }
  });

  it('should seed a closure the store lacks, whose receipt names the closureIntegrity the manifest pins', async () => {
    const host = openHost();
    try {
      const clone = vi.fn(cloneTree);
      const outcomes = await seedNativeStore({ host, store, bundle, signal: AbortSignal.timeout(30_000), clone });
      const pinned = await computeClosureIntegrity(plugin.deployment.dependencies['engine']![0].payloads);
      const inspected = await host.inspect({ package: packageName });

      expect(outcomes).toEqual([
        { package: packageName, dependency: 'engine', closureIntegrity: pinned, status: 'seeded', copy: 'clone' },
      ]);
      expect(clone).toHaveBeenCalledOnce();
      expect(inspected.state).toMatchObject({ status: 'ready', receipts: { engine: { closureIntegrity: pinned } } });
      // Nothing is left in staging, and the seal advanced the store's generation.
      expect(await readdir(join(store, 'tmp'))).toEqual([]);
      const generation = await readFile(join(store, 'generation'), 'utf8');
      expect(generation.trim()).toMatch(/^[\da-f-]{36}$/u);
    } finally {
      host.dispose();
    }
  });

  it('should copy nothing on a second launch, which inspects ready', async () => {
    const first = openHost();
    try {
      await seedNativeStore({ host: first, store, bundle, signal: AbortSignal.timeout(30_000) });
    } finally {
      first.dispose();
    }
    const second = openHost();
    try {
      const clone = vi.fn(cloneTree);
      const outcomes = await seedNativeStore({
        host: second,
        store,
        bundle,
        signal: AbortSignal.timeout(30_000),
        clone,
      });
      const launch = await second.inspectLaunch({ package: packageName });

      expect(clone).not.toHaveBeenCalled();
      expect(outcomes).toMatchObject([{ status: 'present' }]);
      expect(launch.status).toBe('ready');
    } finally {
      second.dispose();
    }
  });

  it('should refuse a tampered bundled file and publish nothing', async () => {
    await writeFile(join(await bundledClosure(), 'worker', 'model.py'), 'WIDTH = 2000\n');
    const host = openHost();
    try {
      const outcomes = await seedNativeStore({ host, store, bundle, signal: AbortSignal.timeout(30_000) });
      const inspected = await host.inspect({ package: packageName });

      expect(outcomes).toMatchObject([{ status: 'refused', files: ['worker/model.py'] }]);
      expect(outcomes[0]?.message).toContain('differs from its receipt (worker/model.py)');
      expect(inspected.state.status).toBe('idle');
      expect(await readdir(join(store, 'closures', 'sha256')).catch(() => [])).toEqual([]);
    } finally {
      host.dispose();
    }
  });

  it('should refuse a bundled receipt that names other pins than the manifest', async () => {
    const receiptPath = join(await bundledClosure(), 'receipt.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as ClosureReceipt;
    await writeFile(receiptPath, JSON.stringify({ ...receipt, closureIntegrity: `sha256-${'A'.repeat(43)}=` }));
    const host = openHost();
    try {
      const outcomes = await seedNativeStore({ host, store, bundle, signal: AbortSignal.timeout(30_000) });

      expect(outcomes).toMatchObject([{ status: 'refused', files: ['receipt.json'] }]);
    } finally {
      host.dispose();
    }
  });

  it('should report a closure neither the store nor the bundle holds as absent', async () => {
    const host = openHost();
    try {
      const outcomes = await seedNativeStore({ host, store, bundle: undefined, signal: AbortSignal.timeout(30_000) });

      expect(outcomes).toMatchObject([{ status: 'absent' }]);
    } finally {
      host.dispose();
    }
  });
});

describe('startNativeStore', () => {
  const start = async (input: { readonly bundle: string | undefined }) => {
    const frames: NativeKernelsFrame[] = [];
    const report = await startNativeStore({
      store,
      bundle: input.bundle,
      hostPath: join(root, 'Tau.app'),
      environment: {},
      post: (frame) => frames.push(frame),
      log: () => undefined,
      signal: AbortSignal.timeout(30_000),
      plugins: [plugin],
    });
    return { frames, report };
  };

  it('should post the sealed closure each native kernel runs from, then collect closures no host links', async () => {
    const dead = join(store, 'closures', 'sha256', 'd'.repeat(64));
    await mkdir(dead, { recursive: true });
    await writeFile(join(dead, 'receipt.json'), '{}');

    const { frames, report } = await start({ bundle });
    const [frame] = frames;

    expect(frames).toHaveLength(1);
    expect(frame?.kernels).toHaveLength(1);
    expect(frame?.kernels[0]).toMatchObject({
      kernel: 'demo',
      package: packageName,
      extensions: ['py'],
      closure: { dependency: 'engine' },
    });
    expect(frame?.kernels[0]).not.toHaveProperty('refusal');
    expect(frame?.kernels[0]?.closure?.root).toMatch(/^.+\/store\/closures\//u);
    expect(report?.garbage?.closures).toEqual(['d'.repeat(64)]);
    expect(await readdir(join(store, 'closures', 'sha256'))).toHaveLength(1);
  });

  it('should post a refusal that names the remedy when no closure can be seeded', async () => {
    const { frames } = await start({ bundle: undefined });

    expect(frames).toEqual([
      {
        type: 'tau:native-kernels',
        kernels: [
          {
            kernel: 'demo',
            package: packageName,
            extensions: ['py'],
            refusal:
              "The demo runtime is not in this machine's payload store. Run `tau prepare demo`, then open the file again.",
          },
        ],
      },
    ]);
  });
});
