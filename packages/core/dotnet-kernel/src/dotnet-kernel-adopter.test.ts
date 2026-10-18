// @vitest-environment node
import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it, vi } from 'vitest';

import { defineDotnetKernelAdopter } from '#adopter.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
  package: '@taucad/sample',
  dependency: 'runtime',
  root: '/store/closures/sha256/0123',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('dotnet/dotnet', 'a'),
    row('dotnet/host/fxr/10.0.11/libhostfxr.so', 'b'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.so', 'c'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.so', 'd'),
    row('tau-worker/Tau.Sample.Worker.dll', 'e'),
    row('tau-worker/Sample.dll', 'f'),
  ],
};

const load = vi.fn(async () => () => {
  throw new Error('not composed in this test');
});

const sample = defineDotnetKernelAdopter({
  package: '@taucad/sample',
  kernel: 'sample',
  displayName: 'Sample',
  workerAssembly: 'tau-worker/Tau.Sample.Worker.dll',
  resources: [{ pattern: /^tau-worker\/Sample\.dll$/u, required: 'tau-worker/Sample.dll' }],
  load,
});

describe('defineDotnetKernelAdopter', () => {
  it('should adopt a NuGet kernel with no seal step and the load the package gave', () => {
    expect(sample).toMatchObject({ package: '@taucad/sample', ecosystem: 'nuget', load });
    expect(sample).not.toHaveProperty('seal');
    expect(load).not.toHaveBeenCalled();
  });

  it('should derive the launch set and the options from the layout, and validate them with its schema', () => {
    const options = sample.optionsFromClosure(closure);

    expect(sample.launchSet(closure.files)).toEqual([
      'dotnet/dotnet',
      'dotnet/host/fxr/10.0.11/libhostfxr.so',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.so',
      'tau-worker/Sample.dll',
      'tau-worker/Tau.Sample.Worker.dll',
    ]);
    expect(options).toMatchObject({
      workerExecutable: '/store/closures/sha256/0123/dotnet/dotnet',
      workerArguments: ['/store/closures/sha256/0123/tau-worker/Tau.Sample.Worker.dll'],
      runtimePath: closure.root,
    });
    expect(sample.optionsSchema.parse(options)).toEqual(options);
    expect(sample.optionsSchema.safeParse({ ...options, runtimePath: undefined }).success).toBe(false);
  });

  it('should refuse a package name that is not a scoped npm name', () => {
    expect(() =>
      defineDotnetKernelAdopter({
        package: 'sample',
        kernel: 'sample',
        displayName: 'Sample',
        workerAssembly: 'tau-worker/Tau.Sample.Worker.dll',
        resources: [],
        load,
      }),
    ).toThrow(TypeError);
  });
});
