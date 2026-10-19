import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import {
  cloneTree,
  desktopNativeKernelIds,
  desktopNativePlugins,
  openDesktopPreparationHost,
  seedNativeStore,
  startNativeStore,
} from '#tau/native-store.js';

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

describe('seedNativeStore', () => {
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
    expect(frame?.store).toBe(await realpath(store));
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
        store: await realpath(store),
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

describe('the desktop native packages', () => {
  it('should seed and inspect every bundled package with its launch set, and never run a seal step', () => {
    expect(desktopNativePlugins.map((plugin) => plugin.package)).toEqual([
      '@taucad/smlibpy',
      '@taucad/build123d',
      '@taucad/picogk',
    ]);
    for (const plugin of desktopNativePlugins) {
      expect(plugin).not.toHaveProperty('seal');
      expect(plugin).not.toHaveProperty('directory');
      expect(plugin.launchSet).toBeTypeOf('function');
    }
  });

  it('should advertise only the kernels this host declares a runtime for', () => {
    const declared = desktopNativePlugins.flatMap(({ deployment }) => Object.keys(deployment.kernels));
    const host = detectHostIndicators();

    expect(declared).toEqual(expect.arrayContaining([...desktopNativeKernelIds()]));
    expect(desktopNativeKernelIds().length > 0).toBe(host !== undefined && host.os !== 'win32');
  });
});
