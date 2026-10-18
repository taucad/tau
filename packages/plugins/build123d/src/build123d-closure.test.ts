import type { ClosureReceipt, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { build123dLaunchSet, build123dOptionsFromClosure, sealBuild123dClosure } from '#build123d-closure.js';
import { build123dOptionsSchema } from '#build123d.schemas.js';
import { build123dNative } from '#native.js';

const hex = (digit: string): string => digit.repeat(64);
const row = (path: string, digit: string, mode = 0o644): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: hex(digit),
  mode,
  payload: 'payload',
});

const target = { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' } as const;

const receiptOf = (files: readonly ReceiptFile[]): ClosureReceipt => ({
  package: '@taucad/build123d',
  dependency: 'engine',
  target,
  selection: {
    host: { os: 'linux', arch: 'x64', libc: 'glibc', translated: false, wasm: { threads: true } },
    candidates: [target],
    emulated: false,
  },
  root: '/store/closures/sha256/abc',
  closureIntegrity: 'sha256-AAAA',
  treeIntegrity: 'sha256-BBBB',
  files,
  payloads: [],
  preparedAt: '2026-10-15T00:00:00.000Z',
  tauVersion: '0.0.0',
});

const closureFiles = [
  row('python/bin/python3', 'a', 0o755),
  row('tau-worker/worker.py', 'd'),
  row('tau-worker/native_materials.py', 'e'),
  row('tau-worker/mechanisms.py', 'f'),
  row('tau-worker/tau_kernel/analyzer.py', 'b'),
  row('tau-worker/tau_kernel/glb.py', 'c'),
  row('tau-worker/tau_kernel/model.py', '1'),
  row('tau-worker/tau_kernel/protocol.py', '2'),
];
const root = '/store/closures/sha256/abc';

describe('build123dOptionsFromClosure', () => {
  it('should map a sealed closure to options the kernel schema accepts', () => {
    const options = build123dOptionsFromClosure(receiptOf(closureFiles));

    expect(build123dOptionsSchema.parse({ closure: options }).closure).toMatchObject({
      pythonExecutable: `${root}/python/bin/python3`,
      pythonSha256: hex('a'),
      workerPath: `${root}/tau-worker/worker.py`,
      workerSha256: hex('d'),
      supportFiles: [
        { path: `${root}/tau-worker/native_materials.py`, sha256: hex('e') },
        { path: `${root}/tau-worker/mechanisms.py`, sha256: hex('f') },
        { path: `${root}/tau-worker/tau_kernel/analyzer.py`, sha256: hex('b') },
        { path: `${root}/tau-worker/tau_kernel/glb.py`, sha256: hex('c') },
        { path: `${root}/tau-worker/tau_kernel/model.py`, sha256: hex('1') },
        { path: `${root}/tau-worker/tau_kernel/protocol.py`, sha256: hex('2') },
      ],
      runtimePath: root,
    });
  });

  it('should name the interpreter and the worker scripts as its launch set', () => {
    expect(build123dLaunchSet().toSorted()).toEqual(closureFiles.map(({ path }) => path).toSorted());
  });

  it('should refuse a closure without the worker scripts', () => {
    expect(() => build123dOptionsFromClosure(receiptOf(closureFiles.slice(0, 1)))).toThrow(
      /has no tau-worker\/worker\.py.*tau prepare build123d --verify/u,
    );
  });
});

describe('the Build123d closure', () => {
  it('should be the Build123d adopter, whose seal proves OCP and build123d import', () => {
    expect(sealBuild123dClosure).toBe(build123dNative.seal);
    expect(build123dNative).toMatchObject({
      worker: { kernelId: 'build123d', kernelName: 'Build123d' },
      selfTestImports: ['OCP', 'build123d'],
    });
  });
});
