// @vitest-environment node
import { join } from 'node:path';

import type { ClosureReceipt, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { picogkOptionsFromClosure } from '#picogk-closure.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';

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

describe('picogkOptionsFromClosure', () => {
  it('runs the worker assembly through the closure muxer under the closure root', () => {
    const options = picogkOptionsFromClosure(receipt());

    expect(options.workerExecutable).toBe(join(root, 'dotnet/dotnet'));
    expect(options.workerSha256).toBe(digest('b'));
    expect(options.workerArguments).toEqual([join(root, 'tau-worker/Tau.PicoGK.Worker.dll')]);
    expect(options.runtimePath).toBe(root);
    expect(picogkOptionsSchema.parse(options)).toEqual(options);
  });

  it('hashes only the named launch resources at each launch', () => {
    const { resourceFiles } = picogkOptionsFromClosure(receipt());

    expect(resourceFiles.map(({ path }) => path.slice(root.length + 1))).toEqual([
      'dotnet/host/fxr/10.0.11/libhostfxr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/System.Private.CoreLib.dll',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libclrjit.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'tau-worker/PicoGK.dll',
      'tau-worker/Tau.PicoGK.Worker.deps.json',
      'tau-worker/Tau.PicoGK.Worker.dll',
      'tau-worker/Tau.PicoGK.Worker.runtimeconfig.json',
      'tau-worker/libSkiaSharp.dylib',
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
    ['tau-worker/Tau.PicoGK.Worker.runtimeconfig.json', 'tau-worker/Tau.PicoGK.Worker.runtimeconfig.json'],
    ['tau-worker/PicoGK.dll', 'tau-worker/PicoGK.dll'],
    ['dotnet/host/fxr/10.0.11/libhostfxr.dylib', 'dotnet/host/fxr/<version>/libhostfxr'],
    [
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'dotnet/shared/Microsoft.NETCore.App/<version>/libhostpolicy',
    ],
    [
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/<version>/libcoreclr',
    ],
    [
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/System.Private.CoreLib.dll',
      'dotnet/shared/Microsoft.NETCore.App/<version>/System.Private.CoreLib.dll',
    ],
  ])('refuses a closure without %s and names the repair', (absent, named) => {
    expect(() => picogkOptionsFromClosure(receipt(closureFiles.filter(({ path }) => path !== absent)))).toThrow(
      `The PicoGK closure at ${root} has no ${named}. Run \`tau prepare picogk --verify\` to repair it.`,
    );
  });

  it('never takes a symlink as the muxer', () => {
    const files = closureFiles.map((entry) =>
      entry.path === 'dotnet/dotnet' ? { ...entry, symlinkTarget: '/usr/local/bin/dotnet' } : entry,
    );

    expect(() => picogkOptionsFromClosure(receipt(files))).toThrow('has no dotnet/dotnet');
  });
});
