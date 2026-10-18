import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build123d } from '@taucad/build123d';
import { build123dNative } from '@taucad/build123d/native';
import { bindNativeKernel, installNativeClosureResolver } from '@taucad/native-process-core/store';
import type { NativeClosureAnswer, NativeClosureRequest } from '@taucad/native-process-core/store';
import { picogkNative } from '@taucad/picogk/native';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { AnyRuntimeDefinition } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { computeTreeIntegrity } from '@taucad/runtime/preparation/node';
import type { ReceiptFile } from '@taucad/runtime/preparation/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixturePayloadStore, nativeKernelsFixture } from '#tau/native-kernels.fixture.js';
import {
  awaitNativeKernels,
  desktopClosureResolver,
  desktopNativeBounds,
  installDesktopNativeKernels,
  receiveNativeKernels,
  verifyDesktopClosure,
} from '#tau/native-kernels.js';

const refusal =
  'The @taucad/build123d closure in this app differs from its receipt (python/bin/python3); reinstall Tau.';

const refusedFrame = {
  type: 'tau:native-kernels',
  store: fixturePayloadStore,
  kernels: [{ kernel: 'build123d', package: '@taucad/build123d', extensions: ['py'], refusal }],
} as const;

describe('desktop native kernels', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    installNativeClosureResolver(undefined);
    await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
  });

  it('should compose the frame main posts first and ignore every other message', async () => {
    const frame = nativeKernelsFixture({ picogk: false });
    receiveNativeKernels({ type: 'tau:zoo-proxy-credential', token: 'unrelated' });
    receiveNativeKernels(frame);
    receiveNativeKernels(nativeKernelsFixture({ picogk: true }));

    await expect(awaitNativeKernels()).resolves.toBe(frame);
  });

  it('should bind each kernel to the sealed closure main names, mapped by its own deployment', async () => {
    const frame = nativeKernelsFixture({ picogk: true });
    installDesktopNativeKernels(frame);
    const build123dRoot = frame.kernels[0]!.closure!.root;
    const picogkRoot = frame.kernels[1]!.closure!.root;

    const build123dBound = await bindNativeKernel({
      deployment: build123dNative,
      kernel: 'build123d',
      options: desktopNativeBounds,
    });
    const picogkBound = await bindNativeKernel({ deployment: picogkNative, kernel: 'picogk', options: {} });

    expect(build123dBound).toMatchObject({
      closureRoot: build123dRoot,
      options: { pythonSha256: '1'.repeat(64), runtimePath: build123dRoot, ...desktopNativeBounds },
    });
    expect(build123dBound.options).toHaveProperty('supportFiles', [
      { path: `${build123dRoot}/tau-worker/native_materials.py`, sha256: 'b'.repeat(64) },
      { path: `${build123dRoot}/tau-worker/mechanisms.py`, sha256: 'c'.repeat(64) },
      { path: `${build123dRoot}/tau-worker/tau_kernel/analyzer.py`, sha256: '2'.repeat(64) },
      { path: `${build123dRoot}/tau-worker/tau_kernel/glb.py`, sha256: '3'.repeat(64) },
      { path: `${build123dRoot}/tau-worker/tau_kernel/model.py`, sha256: 'd'.repeat(64) },
      { path: `${build123dRoot}/tau-worker/tau_kernel/protocol.py`, sha256: 'e'.repeat(64) },
    ]);
    expect(picogkBound).toMatchObject({
      closureRoot: picogkRoot,
      options: {
        workerExecutable: `${picogkRoot}/dotnet/dotnet`,
        workerSha256: '5'.repeat(64),
        runtimePath: picogkRoot,
        workerArguments: [`${picogkRoot}/tau-worker/Tau.PicoGK.Worker.dll`],
      },
    });
  });

  it('should look up a kernel the frame does not name in the store main seeded', async () => {
    const fallback = vi.fn(
      async (_request: NativeClosureRequest): Promise<NativeClosureAnswer> => ({
        status: 'unavailable',
        reason: 'unsupported-target',
        byteLength: 0,
        detail: 'No variant fits darwin-x64.',
      }),
    );
    const resolve = desktopClosureResolver(nativeKernelsFixture({ picogk: false }), fallback);

    const answer = await resolve({
      package: '@taucad/picogk',
      kernel: 'picogk',
      dependencies: ['runtime'],
      deployment: picogkNative,
    });

    expect(answer).toMatchObject({ status: 'unavailable', reason: 'unsupported-target' });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('should answer describe, render and export of a file whose kernel has no closure with main refusal', async () => {
    installDesktopNativeKernels(refusedFrame);
    const client = createRuntimeClient<AnyRuntimeDefinition>({
      transport: inProcessTransport({
        runtime: defineRuntime({ plugins: [build123d({ kernels: { default: desktopNativeBounds } })] }),
        fileSystem: fromMemoryFs({ 'main.py': 'from build123d import Box\n' }),
      }),
    });
    cleanups.push(async () => client.shutdown());
    const issue = {
      code: 'KERNEL_NOT_PREPARED',
      message: refusal,
      details: { kernel: 'build123d', package: '@taucad/build123d', extension: '.py' },
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
