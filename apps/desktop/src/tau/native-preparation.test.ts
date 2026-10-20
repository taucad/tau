import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';
import { detectHostIndicators } from '@taucad/runtime/preparation/node';
import type { DesktopKernelProgress } from '@taucad/types/desktop-native-kernels';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createDesktopKernelPreparer } from '#tau/native-preparation.js';

const worker = 'print("ready")\n';

/** This machine's variant: the closure is the same bytes whatever the host, only the target differs. */
const hostTarget = () => {
  const host = detectHostIndicators();
  if (host === undefined || host.os === 'win32') {
    throw new Error('These tests prepare a native closure, which only macOS and Linux hosts select.');
  }
  return host.os === 'linux'
    ? { runtime: 'native', os: 'linux', arch: host.arch, libc: host.libc ?? 'glibc' }
    : { runtime: 'native', os: 'darwin', arch: host.arch };
};

const integrity = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

let root: string;
let store: string;
let executable: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'tau-desktop-prepare-')));
  await mkdir(join(root, 'package', 'payloads'), { recursive: true });
  await writeFile(join(root, 'package', 'payloads', 'worker.py'), worker);
  store = join(root, 'store');
  executable = join(root, 'Tau');
  await writeFile(executable, '');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A native package whose closure is one file it ships and, optionally, one it downloads. */
const deploymentOf = (download?: { readonly bytes: Uint8Array<ArrayBuffer> }) =>
  defineNativeKernelDeployment({
    package: '@acme/demo',
    ecosystem: 'none',
    manifest: {
      schemaVersion: 1,
      kernels: { demo: { requires: ['engine'], extensions: ['py'] } },
      dependencies: {
        engine: [
          {
            target: hostTarget(),
            payloads: [
              {
                name: 'worker.py',
                integrity: integrity(Buffer.from(worker)),
                byteLength: Buffer.byteLength(worker),
                format: 'raw',
                origin: { kind: 'packagePath', path: 'payloads/worker.py' },
                destination: 'engine',
              },
              ...(download === undefined
                ? []
                : [
                    {
                      name: 'model.py',
                      integrity: integrity(download.bytes),
                      byteLength: download.bytes.byteLength,
                      format: 'raw',
                      origin: { kind: 'url', urls: ['https://example.test/model.py'] },
                      destination: 'engine',
                    },
                  ]),
            ],
          },
        ],
      },
    },
    moduleUrl: import.meta.url,
    packageRoot: pathToFileURL(`${join(root, 'package')}/`).href,
    optionsSchema: z.object({ runtimePath: z.string() }),
    optionsFromClosure: ({ root: closureRoot }) => ({ runtimePath: closureRoot }),
    launchSet: () => ['engine/worker.py'],
  });

const open = (
  input: { readonly download?: { readonly bytes: Uint8Array<ArrayBuffer> }; readonly fetch?: typeof fetch } = {},
) => {
  const progress: DesktopKernelProgress[] = [];
  const preparer = createDesktopKernelPreparer({
    store,
    hostPath: executable,
    environment: {},
    onProgress: (report) => progress.push(report),
    log: () => undefined,
    deployments: [deploymentOf(input.download)],
    fetch:
      input.fetch ??
      (async () => {
        throw new Error('no request expected');
      }),
  });
  return { preparer, progress };
};

describe('createDesktopKernelPreparer', () => {
  it('should prepare a kernel into the store and report its download progress', async () => {
    const bytes = Buffer.from('WIDTH = 20\n');
    const { preparer, progress } = open({ download: { bytes }, fetch: async () => new Response(bytes) });
    try {
      const outcome = await preparer.prepare('demo');

      expect(outcome).toMatchObject({ status: 'ready', kernel: 'demo' });
      expect(await readdir(join(store, 'closures', 'sha256'))).toHaveLength(1);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.at(-1)?.kernel).toBe('demo');
      expect(progress.at(-1)?.total).toBeGreaterThan(0);
      /* The link names the app, so the startup collection of the next launch keeps what this one prepared. */
      const links = await readdir(join(store, 'links'));
      expect(links).toHaveLength(1);
      const link: unknown = JSON.parse(await readFile(join(store, 'links', links[0]!), 'utf8'));
      expect(link).toMatchObject({ hostPath: executable });
    } finally {
      await preparer.dispose();
    }
  });

  it('should join a second request for a kernel already preparing', async () => {
    const { preparer } = open();
    try {
      const first = preparer.prepare('demo');
      const second = preparer.prepare('demo');

      expect(second).toBe(first);
      await expect(first).resolves.toMatchObject({ status: 'ready', kernel: 'demo' });
    } finally {
      await preparer.dispose();
    }
  });

  it('should answer a kernel no package declares as failed with UNKNOWN_KERNEL', async () => {
    const { preparer } = open();
    try {
      await expect(preparer.prepare('nope')).resolves.toEqual({
        status: 'failed',
        kernel: 'nope',
        code: 'UNKNOWN_KERNEL',
        message: "No native kernel is called 'nope'. Kernels that can be prepared: demo.",
      });
    } finally {
      await preparer.dispose();
    }
  });

  it('should open the store again after a failed open', async () => {
    /* A file where the store directory belongs fails the first open. */
    await writeFile(store, '');
    const { preparer } = open();
    try {
      await expect(preparer.prepare('demo')).resolves.toMatchObject({
        status: 'failed',
        kernel: 'demo',
        code: 'PREPARE_KERNEL_FAILED',
      });
      await rm(store);

      await expect(preparer.prepare('demo')).resolves.toMatchObject({ status: 'ready', kernel: 'demo' });
    } finally {
      await preparer.dispose();
    }
  });

  it('should cancel a preparation that is downloading', async () => {
    const started = Promise.withResolvers<undefined>();
    const { preparer } = open({
      download: { bytes: Buffer.from('WIDTH = 20\n') },
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          started.resolve(undefined);
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    });
    try {
      const outcome = preparer.prepare('demo');
      await started.promise;
      preparer.cancel('demo');

      await expect(outcome).resolves.toMatchObject({ status: 'cancelled', kernel: 'demo' });
    } finally {
      await preparer.dispose();
    }
  });
});
