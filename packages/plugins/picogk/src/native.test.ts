// @vitest-environment node
import { readFile } from 'node:fs/promises';

import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { picogkLaunchSet, picogkOptionsFromClosure } from '#picogk-closure.js';
import { picogkNative } from '#native.js';
import { picogk } from '#picogk.plugin.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
  package: '@taucad/picogk',
  dependency: 'runtime',
  root: '/store/closures/sha256/0123',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('dotnet/dotnet', 'a'),
    row('dotnet/host/fxr/10.0.11/libhostfxr.dylib', 'b'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib', 'c'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib', 'd'),
    row('tau-worker/Tau.PicoGK.Worker.dll', 'e'),
    row('tau-worker/PicoGK.dll', 'f'),
    row('tau-worker/picogk.26.2.dylib', '1'),
  ],
};

describe('picogkNative', () => {
  it('should adopt the package named in its manifest with the mapping its closure module exports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
    };

    expect(picogkNative).toMatchObject({ package: manifest.name, ecosystem: 'nuget' });
    expect(picogkNative.optionsFromClosure(closure)).toEqual(picogkOptionsFromClosure(closure));
    expect(picogkNative.launchSet(closure.files)).toEqual(picogkLaunchSet(closure.files));
    expect(picogkNative).not.toHaveProperty('seal');
  });

  it('should validate the options a sealed closure maps to, including its root and worker assembly', () => {
    const options = picogkNative.optionsFromClosure(closure);

    expect(picogkNative.optionsSchema.parse(options)).toEqual(options);
    expect(picogkNative.optionsSchema.safeParse({ ...options, workerArguments: undefined }).success).toBe(false);
  });

  it('should launch only files the closure lists', () => {
    const listed = new Set(closure.files.map(({ path }) => path));

    expect(picogkNative.launchSet(closure.files).every((path) => listed.has(path))).toBe(true);
  });

  it('should give the kernel plugin an explicit closure and host bounds as its options', () => {
    const closureOptions = picogkNative.optionsFromClosure(closure);

    const { capabilities } = picogk({ kernels: { default: { closure: closureOptions, maxArtifactBytes: 1024 } } });

    expect(capabilities.kernels.map(({ id, extensions }) => ({ id, extensions }))).toEqual([
      { id: 'picogk', extensions: ['cs'] },
    ]);
    expect(capabilities.kernels[0].options).toMatchObject({ maxArtifactBytes: 1024, closure: closureOptions });
  });
});
