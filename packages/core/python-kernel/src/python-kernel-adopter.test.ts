import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definePythonKernelAdopter } from '#python-kernel-adopter.js';
import type { PythonClosureOptions } from '#python-closure.js';
import { pythonKernelModules } from '#python-kernel.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
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

const manifest = { schemaVersion: 1, kernels: { example: { requires: ['engine'], extensions: ['py'] } } };

const define = (optionsSchema?: z.ZodType<PythonClosureOptions>) =>
  definePythonKernelAdopter({
    package: '@taucad/example',
    manifest,
    moduleUrl: 'file:///packages/example/src/native.ts',
    worker: { kernelId: 'example', kernelName: 'Example', workerModules: ['example_worker.py'] },
    selfTestImports: ['example'],
    projectLibraries: { example: '1.0.0' },
    ...(optionsSchema === undefined ? {} : { optionsSchema }),
  });

describe('definePythonKernelAdopter', () => {
  it('deploys a pypi package whose closure options, launch set and seal follow from its worker', () => {
    const adopter = define();
    const options = adopter.optionsFromClosure(closure);

    expect(adopter).toMatchObject({
      package: '@taucad/example',
      ecosystem: 'pypi',
      manifest,
      entry: 'file:///packages/example/src/native.ts',
      packageRoot: 'file:///packages/example/',
      worker: { kernelId: 'example' },
      selfTestImports: ['example'],
      projectLibraries: { example: '1.0.0' },
    });
    expect(adopter).not.toHaveProperty('load');
    expect(typeof adopter.seal).toBe('function');
    expect(adopter.launchSet()).toEqual(closure.files.map(({ path }) => path));
    expect(adopter.optionsSchema.parse(options)).toEqual(options);
    expect(adopter.optionsSchema.safeParse({ ...options, runtimePath: undefined }).success).toBe(false);
  });

  it('keeps an options schema the kernel supplies', () => {
    const optionsSchema = z.custom<PythonClosureOptions>(() => true);

    expect(define(optionsSchema).optionsSchema).toBe(optionsSchema);
  });

  it('refuses a package name that is not scoped', () => {
    expect(() =>
      definePythonKernelAdopter({
        package: 'example',
        manifest,
        moduleUrl: 'file:///packages/example/src/native.ts',
        worker: { kernelId: 'example', kernelName: 'Example', workerModules: ['example_worker.py'] },
        selfTestImports: ['example'],
        projectLibraries: {},
      }),
    ).toThrow(TypeError);
  });
});
