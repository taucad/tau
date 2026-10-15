import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRuntimeClient } from '@taucad/runtime/client';
import type { AnyRuntimeDefinition } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { computeTreeIntegrity } from '@taucad/runtime/preparation/node';
import type { ReceiptFile } from '@taucad/runtime/preparation/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { afterEach, describe, expect, it } from 'vitest';

import { nativeKernelsFixture } from '#tau/native-kernels.fixture.js';
import {
  awaitNativeKernels,
  desktopNativeKernels,
  receiveNativeKernels,
  verifyDesktopClosure,
} from '#tau/native-kernels.js';

const refusal =
  'The @taucad/build123d closure in this app differs from its receipt (python/bin/python3); reinstall Tau.';

describe('desktop native kernels', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
  });

  it('should compose the frame main posts first and ignore every other message', async () => {
    const frame = nativeKernelsFixture({ picogk: false });
    receiveNativeKernels({ type: 'tau:zoo-proxy-credential', token: 'unrelated' });
    receiveNativeKernels(frame);
    receiveNativeKernels(nativeKernelsFixture({ picogk: true }));

    await expect(awaitNativeKernels()).resolves.toBe(frame);
  });

  it('should map each sealed closure to its kernel options and stand in for none', () => {
    const frame = nativeKernelsFixture({ picogk: true });
    const native = desktopNativeKernels(frame);
    const picogkRoot = frame.kernels[1]!.closure!.root;

    expect(native.unavailable).toBeUndefined();
    expect(native.build123d).toMatchObject({ pythonSha256: '1'.repeat(64) });
    expect(native.picogk).toMatchObject({
      workerExecutable: `${picogkRoot}/dotnet/dotnet`,
      workerSha256: '5'.repeat(64),
      runtimePath: picogkRoot,
      workerArguments: [`${picogkRoot}/tau-worker/Tau.PicoGK.Worker.dll`],
    });
  });

  it('should answer describe, render and export of a file whose kernel has no closure with main refusal', async () => {
    const { unavailable, build123d } = desktopNativeKernels({
      type: 'tau:native-kernels',
      kernels: [{ kernel: 'build123d', package: '@taucad/build123d', extensions: ['py'], refusal }],
    });
    expect(build123d).toBeUndefined();
    const client = createRuntimeClient<AnyRuntimeDefinition>({
      transport: inProcessTransport({
        runtime: defineRuntime({ plugins: [unavailable!] }),
        fileSystem: fromMemoryFs({ 'main.py': 'from build123d import Box\n' }),
      }),
    });
    cleanups.push(async () => client.shutdown());
    const issue = {
      code: 'KERNEL_NOT_PREPARED',
      message: refusal,
      details: { kernel: 'build123d', package: '@taucad/build123d', entryPath: 'main.py' },
    };

    const description = await client.describe({ source: { path: 'main.py' } });
    const document = client.open({ source: { path: 'main.py' }, watch: false });
    const rendering = await document.view().rendering();
    const exported = await document.export('glb');

    expect(description).toMatchObject({ success: false, issues: [issue] });
    expect(rendering).toMatchObject({ rendering: { success: false, issues: [issue] } });
    expect(exported).toMatchObject({ success: false, issues: [issue] });
  });

  it('should name the damaged file of a closure whose worker exits before its handshake', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-desktop-closure-'));
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'python', 'bin'), { recursive: true });
    await writeFile(join(root, 'python', 'bin', 'python3'), 'tampered', { mode: 0o755 });
    const files: ReceiptFile[] = [
      {
        path: 'python/bin/python3',
        byteLength: 8,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mode: 0o755,
      },
    ];
    await writeFile(
      join(root, 'receipt.json'),
      JSON.stringify({ tauVersion: '0', files, treeIntegrity: await computeTreeIntegrity(files) }),
    );

    await expect(verifyDesktopClosure(root, AbortSignal.timeout(10_000))).resolves.toEqual({
      files: ['python/bin/python3'],
      remedy: `Quit Tau, remove ${root} and open Tau again to restore it from the app, or run \`tau prepare --verify\`.`,
    });
  });
});
