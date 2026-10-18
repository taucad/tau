// @vitest-environment node
import { installNativeClosureResolver } from '@taucad/native-process-core/store';
import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { afterEach, describe, expect, it } from 'vitest';

import { defineDotnetKernelAdopter } from '#dotnet-kernel-adopter.js';
import { bindDotnetKernel } from '#dotnet-kernel-binding.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const sample = defineDotnetKernelAdopter({
  package: '@taucad/sample',
  kernel: 'sample',
  displayName: 'Sample',
  workerAssembly: 'tau-worker/Tau.Sample.Worker.dll',
  resources: [],
  manifest: {
    schemaVersion: 1,
    kernels: { sample: { requires: ['runtime'], extensions: ['cs'] } },
    dependencies: {
      runtime: [
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
  moduleUrl: 'file:///packages/sample/src/native.ts',
});

const sealed: ClosureLaunch = {
  package: '@taucad/sample',
  dependency: 'runtime',
  root: '/store/closures/sha256/0123',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('dotnet/dotnet', 'a'),
    row('dotnet/host/fxr/10.0.11/libhostfxr.so', 'b'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.so', 'c'),
    row('tau-worker/Tau.Sample.Worker.dll', 'e'),
  ],
};

describe('bindDotnetKernel', () => {
  afterEach(() => {
    installNativeClosureResolver(undefined);
  });

  it("should bind the layout's kernel to the resolver's sealed closure, with the host's bounds", async () => {
    installNativeClosureResolver(async ({ kernel }) => {
      expect(kernel).toBe('sample');
      return { status: 'ready', closures: { runtime: sealed } };
    });

    await expect(
      bindDotnetKernel({ adopter: sample, options: { requestTimeout: 0, maxArtifactBytes: 64 } }),
    ).resolves.toEqual({
      options: { ...sample.optionsFromClosure(sealed), requestTimeout: 0, maxArtifactBytes: 64 },
      closureRoot: sealed.root,
    });
  });
});
