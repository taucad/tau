import { readFile } from 'node:fs/promises';

import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { build123dLaunchSet, build123dOptionsFromClosure, sealBuild123dClosure } from '#build123d-closure.js';
import { build123dNative } from '#native.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
  package: '@taucad/build123d',
  dependency: 'engine',
  root: '/store/closures/sha256/abc',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('python/bin/python3', 'a'),
    row('tau-worker/worker.py', 'b'),
    row('tau-worker/native_materials.py', 'e'),
    row('tau-worker/mechanisms.py', 'f'),
    row('tau-worker/tau_kernel/analyzer.py', 'c'),
    row('tau-worker/tau_kernel/glb.py', 'd'),
    row('tau-worker/tau_kernel/model.py', '1'),
    row('tau-worker/tau_kernel/protocol.py', '2'),
  ],
};

describe('build123dNative', () => {
  it('should adopt the package named in its manifest with the closure module it already exports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
    };

    expect(build123dNative).toMatchObject({
      package: manifest.name,
      ecosystem: 'pypi',
      optionsFromClosure: build123dOptionsFromClosure,
      seal: sealBuild123dClosure,
      launchSet: build123dLaunchSet,
    });
  });

  it('should validate the options a sealed closure maps to, including its root', () => {
    const options = build123dNative.optionsFromClosure(closure);

    expect(build123dNative.optionsSchema.parse(options)).toMatchObject({
      ...options,
      requestTimeout: 0,
      runtimePath: closure.root,
    });
    expect(build123dNative.optionsSchema.safeParse({ ...options, runtimePath: undefined }).success).toBe(false);
  });

  it('should launch only files the closure lists', () => {
    const listed = new Set(closure.files.map(({ path }) => path));

    expect(build123dNative.launchSet(closure.files).every((path) => listed.has(path))).toBe(true);
  });

  it('should load the kernel plugin bound to the closure options and host bounds', async () => {
    const factory = await build123dNative.load();

    const { capabilities } = factory({ ...build123dNative.optionsFromClosure(closure), requestTimeout: 60_000 });

    expect(capabilities.kernels.map(({ id, extensions }) => ({ id, extensions }))).toEqual([
      { id: 'build123d', extensions: ['py'] },
    ]);
    expect(capabilities.kernels[0]?.options).toMatchObject({ requestTimeout: 60_000, runtimePath: closure.root });
  });
});
