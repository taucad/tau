import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPreparationHost, detectHostIndicators, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type { DependencyPayload, DependencyTarget, PreparationPlugin } from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';
import { desktopNativeKernelIds, desktopNativePlugins, startNativeStore } from '#tau/native-store.js';

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
let producerStore: string;
let store: string;

/** Seal the closure as a preparation does, into a producer store the tests copy into the desktop's store. */
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
  producerStore = join(root, 'producer');
  /* The host path is the store's GC root: a link whose host is gone is dropped, so the app must exist. */
  await mkdir(join(root, 'Tau.app'));
  store = join(root, 'store');
  await mkdir(store);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('startNativeStore', () => {
  const start = async () => {
    const frames: NativeKernelsFrame[] = [];
    const report = await startNativeStore({
      store,
      hostPath: join(root, 'Tau.app'),
      environment: {},
      post: (frame) => frames.push(frame),
      log: () => undefined,
      signal: AbortSignal.timeout(30_000),
      plugins: [plugin],
    });
    return { frames, report };
  };

  it('should post the sealed closure each prepared kernel runs from, then collect closures no host links', async () => {
    await cp(join(producerStore, 'closures'), join(store, 'closures'), { recursive: true });
    const dead = join(store, 'closures', 'sha256', 'd'.repeat(64));
    await mkdir(dead, { recursive: true });
    await writeFile(join(dead, 'receipt.json'), '{}');

    const { frames, report } = await start();
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
    expect(report?.kernels).toEqual(['demo']);
    expect(report?.garbage?.closures).toEqual(['d'.repeat(64)]);
    expect(await readdir(join(store, 'closures', 'sha256'))).toHaveLength(1);
  });

  it('should leave a kernel the store lacks out of the frame, so the utility reads the store for it', async () => {
    const { frames } = await start();

    expect(frames).toEqual([{ type: 'tau:native-kernels', store: await realpath(store), kernels: [] }]);
  });

  it('should refuse every kernel, naming the store, when the store cannot be opened', async () => {
    await writeFile(join(root, 'file'), '');
    store = join(root, 'file', 'payloads');

    const { frames, report } = await start();

    expect(report).toBeUndefined();
    expect(frames).toHaveLength(1);
    expect(frames[0]?.kernels.map(({ kernel }) => kernel)).toEqual(['demo']);
    expect(frames[0]?.kernels[0]?.refusal).toContain(`Tau could not open its payload store at ${store}`);
  });
});

describe('the desktop native packages', () => {
  it('should inspect every listed package with its launch set, and never run a seal step at startup', () => {
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
