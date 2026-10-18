// @vitest-environment node
import { join } from 'node:path';

import type { ClosureReceipt, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { dotnetLaunchSet, dotnetOptionsFromClosure } from '#dotnet-closure.js';
import type { DotnetClosureLayout } from '#dotnet-closure.js';
import { dotnetClosureOptionsSchema } from '#dotnet.schemas.js';

// The PicoGK layout, as its kernel package states it.
const layout: DotnetClosureLayout = {
  kernel: 'picogk',
  displayName: 'PicoGK',
  workerAssembly: 'tau-worker/Tau.PicoGK.Worker.dll',
  resources: [
    { pattern: /^tau-worker\/PicoGK\.dll$/u, required: 'tau-worker/PicoGK.dll' },
    { pattern: /^tau-worker\/picogk[^/]*\.(?:dylib|so)$/u, required: 'tau-worker/picogk.<version>.dylib' },
  ],
};
const launchSet = dotnetLaunchSet(layout);
const optionsFromClosure = dotnetOptionsFromClosure(layout);

const root = '/store/closures/sha256/0123';
const digest = (seed: string): string => seed.repeat(64).slice(0, 64);
const file = (path: string, seed = 'a', extra: Partial<ReceiptFile> = {}): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digest(seed),
  mode: 0o644,
  ...extra,
});
const closureFiles: readonly ReceiptFile[] = [
  file('dotnet/dotnet', 'b', { mode: 0o755 }),
  file('dotnet/LICENSE.txt'),
  file('dotnet/host/fxr/10.0.11/libhostfxr.dylib', 'c'),
  file('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib', 'd'),
  file('dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib', 'e'),
  file('dotnet/shared/Microsoft.NETCore.App/10.0.11/libclrjit.dylib', 'f'),
  file('dotnet/shared/Microsoft.NETCore.App/10.0.11/System.Private.CoreLib.dll', '1'),
  file('dotnet/shared/Microsoft.NETCore.App/10.0.11/System.Linq.dll', '2'),
  file('tau-worker/Tau.PicoGK.Worker.dll', '3'),
  file('tau-worker/Tau.PicoGK.Worker.runtimeconfig.json', '4'),
  file('tau-worker/Tau.PicoGK.Worker.deps.json', '5'),
  file('tau-worker/PicoGK.dll', '6'),
  file('tau-worker/picogk.26.2.dylib', '7'),
  file('tau-worker/libSkiaSharp.dylib', '8'),
  file('tau-worker/Microsoft.CodeAnalysis.dll', '9'),
  file('tau-worker/link.dylib', '0', { symlinkTarget: 'picogk.26.2.dylib' }),
];
const receipt = (files: readonly ReceiptFile[] = closureFiles): ClosureReceipt => ({
  package: '@taucad/picogk',
  dependency: 'runtime',
  target: { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' },
  selection: {
    host: { os: 'darwin', arch: 'arm64', osVersion: '15.7', translated: false, wasm: { threads: true } },
    candidates: [],
    emulated: false,
  },
  root,
  closureIntegrity: `sha256-${'A'.repeat(43)}=`,
  treeIntegrity: `sha256-${'B'.repeat(43)}=`,
  files,
  payloads: [],
  preparedAt: '2026-10-15T00:00:00.000Z',
  tauVersion: '0.0.0',
});

describe('dotnetOptionsFromClosure', () => {
  it('should run the worker assembly through the closure muxer under the closure root', () => {
    const options = optionsFromClosure(receipt());

    expect(options.workerExecutable).toBe(join(root, 'dotnet/dotnet'));
    expect(options.workerSha256).toBe(digest('b'));
    expect(options.workerArguments).toEqual([join(root, 'tau-worker/Tau.PicoGK.Worker.dll')]);
    expect(options.runtimePath).toBe(root);
    expect(dotnetClosureOptionsSchema.parse(options)).toEqual(options);
  });

  it('should name the files the process loads first as its launch set, and map its launch index as its receipt', () => {
    const paths = launchSet(closureFiles);
    const index = { ...receipt(), files: closureFiles.filter(({ path }) => paths.includes(path)) };

    expect(paths).toEqual([
      'dotnet/dotnet',
      'dotnet/host/fxr/10.0.11/libhostfxr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'tau-worker/PicoGK.dll',
      'tau-worker/Tau.PicoGK.Worker.dll',
      'tau-worker/picogk.26.2.dylib',
    ]);
    expect(optionsFromClosure(index)).toEqual(optionsFromClosure(receipt()));
  });

  it('should hash only the named launch resources at each launch, labelled with the display name', () => {
    const { resourceFiles } = optionsFromClosure(receipt());

    expect(resourceFiles.map(({ path }) => path.slice(root.length + 1))).toEqual([
      'dotnet/host/fxr/10.0.11/libhostfxr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'tau-worker/PicoGK.dll',
      'tau-worker/Tau.PicoGK.Worker.dll',
      'tau-worker/picogk.26.2.dylib',
    ]);
    expect(resourceFiles.find(({ path }) => path.endsWith('PicoGK.dll'))).toEqual({
      path: join(root, 'tau-worker/PicoGK.dll'),
      sha256: digest('6'),
      label: 'PicoGK closure tau-worker/PicoGK.dll',
    });
  });

  it.each([
    ['dotnet/dotnet', 'dotnet/dotnet'],
    ['tau-worker/Tau.PicoGK.Worker.dll', 'tau-worker/Tau.PicoGK.Worker.dll'],
    ['tau-worker/PicoGK.dll', 'tau-worker/PicoGK.dll'],
    ['dotnet/host/fxr/10.0.11/libhostfxr.dylib', 'dotnet/host/fxr/<version>/libhostfxr'],
    [
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'dotnet/shared/Microsoft.NETCore.App/<version>/libhostpolicy',
    ],
    ['tau-worker/picogk.26.2.dylib', 'tau-worker/picogk.<version>.dylib'],
  ])('should refuse a closure without %s and name the repair', (absent, named) => {
    expect(() => optionsFromClosure(receipt(closureFiles.filter(({ path }) => path !== absent)))).toThrow(
      `The PicoGK closure at ${root} has no ${named}. Run \`tau prepare picogk --verify\` to repair it.`,
    );
  });

  it('should never take a symlink as the muxer', () => {
    const files = closureFiles.map((entry) =>
      entry.path === 'dotnet/dotnet' ? { ...entry, symlinkTarget: '/usr/local/bin/dotnet' } : entry,
    );

    expect(() => optionsFromClosure(receipt(files))).toThrow('has no dotnet/dotnet');
  });

  it('should match the worker assembly by its exact path, not as a pattern', () => {
    const lookalike = closureFiles.map((entry) =>
      entry.path === 'tau-worker/Tau.PicoGK.Worker.dll'
        ? { ...entry, path: 'tau-worker/Tau-PicoGK-Worker.dll' }
        : entry,
    );

    expect(launchSet(lookalike)).not.toContain('tau-worker/Tau-PicoGK-Worker.dll');
    expect(() => optionsFromClosure(receipt(lookalike))).toThrow('has no tau-worker/Tau.PicoGK.Worker.dll');
  });

  it('should need only the host files and the worker assembly when a kernel names no other resource', () => {
    const managed = dotnetOptionsFromClosure({ ...layout, resources: [] });
    const files = closureFiles.filter(({ path }) => !path.endsWith('PicoGK.dll') && !path.endsWith('.26.2.dylib'));

    expect(managed(receipt(files)).resourceFiles).toHaveLength(3);
  });
});
