import { installNativeClosureResolver, UnpreparedKernelError } from '@taucad/native-process-core/store';
import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { afterEach, describe, expect, it } from 'vitest';

import { definePythonKernelAdopter } from '#python-kernel-adopter.js';
import { bindPythonKernel } from '#python-kernel-binding.js';
import { pythonKernelModules } from '#python-kernel.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const adopter = definePythonKernelAdopter({
  package: '@taucad/example',
  manifest: {
    schemaVersion: 1,
    kernels: { example: { requires: ['engine'], extensions: ['py'] } },
    dependencies: {
      engine: [
        {
          target: { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' },
          payloads: [
            {
              name: 'runtime',
              integrity: `sha256-${'A'.repeat(43)}=`,
              byteLength: 1,
              format: 'tar.gz',
              origin: { kind: 'url', urls: ['https://example.test/runtime.tar.gz'] },
              destination: 'runtime',
            },
          ],
        },
      ],
    },
  },
  moduleUrl: 'file:///packages/example/src/native.ts',
  worker: { kernelId: 'example', kernelName: 'Example', workerModules: ['example_worker.py'] },
  selfTestImports: ['example'],
  projectLibraries: {},
});

const sealed: ClosureLaunch = {
  package: '@taucad/example',
  dependency: 'engine',
  root: '/store/closures/sha256/abc',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('python/bin/python3', 'a'),
    row('tau-worker/example_worker.py', 'b'),
    ...pythonKernelModules.map((module) => row(`tau-worker/${module}`, 'c')),
  ],
};

const bounds = { requestTimeout: 0, maxArtifactBytes: 1024 };

describe('bindPythonKernel', () => {
  afterEach(() => {
    installNativeClosureResolver(undefined);
  });

  it("binds the kernel named by its worker to the resolver's sealed closure, with the host's bounds", async () => {
    installNativeClosureResolver(async ({ kernel, dependencies }) => {
      expect({ kernel, dependencies }).toEqual({ kernel: 'example', dependencies: ['engine'] });
      return { status: 'ready', closures: { engine: sealed } };
    });

    await expect(bindPythonKernel({ adopter, options: bounds })).resolves.toEqual({
      options: { ...adopter.optionsFromClosure(sealed), ...bounds },
      closureRoot: sealed.root,
    });
  });

  it('keeps an explicit closure, and refuses an unprepared kernel with KERNEL_NOT_PREPARED', async () => {
    const closure = adopter.optionsFromClosure(sealed);
    installNativeClosureResolver(async () => ({ status: 'unavailable', reason: 'not-prepared', byteLength: 2e6 }));

    await expect(bindPythonKernel({ adopter, options: { ...bounds, closure } })).resolves.toEqual({
      options: { ...closure, ...bounds },
    });
    await expect(bindPythonKernel({ adopter, options: bounds })).rejects.toThrow(UnpreparedKernelError);
    await expect(bindPythonKernel({ adopter, options: bounds })).rejects.toMatchObject({
      issues: [{ code: 'KERNEL_NOT_PREPARED', details: { kernel: 'example', extension: '.py', byteLength: 2e6 } }],
    });
  });
});
