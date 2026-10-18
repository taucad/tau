import { join } from 'node:path';

import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { definePlugin } from '@taucad/runtime/plugin';
import type { ClosureLaunch } from '@taucad/runtime/preparation/node';
import { defineRuntime, resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineNativeKernelDeployment, nativeDeploymentOf, withNativeDeployment } from '#native-kernel-adopter.js';
import type { NativeKernelDeployment } from '#native-kernel-adopter.js';

const optionsSchema = z.object({ executable: z.string(), runtimePath: z.string() });

const closure: ClosureLaunch = {
  package: '@acme/worker-kernel',
  dependency: 'engine',
  root: '/store/closures/sha256/abc',
  closureIntegrity: `sha256-${'a'.repeat(44)}`,
  files: [{ path: 'bin/worker', byteLength: 3, sha256: 'b'.repeat(64), mode: 0o755 }],
};

const manifest = {
  schemaVersion: 1,
  kernels: { worker: { requires: ['engine'], extensions: ['wk', 'wkx'] } },
  dependencies: { engine: [] },
};

const deploymentInput = {
  package: '@acme/worker-kernel',
  ecosystem: 'none',
  manifest,
  moduleUrl: 'file:///packages/worker-kernel/src/native.ts',
  optionsSchema,
  optionsFromClosure: ({ root }: ClosureLaunch) => ({ executable: join(root, 'bin', 'worker'), runtimePath: root }),
  launchSet: () => ['bin/worker'],
} as const;

const workerKernel = defineKernel({
  id: 'worker',
  extensions: ['wk'],
  name: 'WorkerKernel',
  version: '1',
  optionsSchema: z.object({ requestTimeout: z.number().default(0) }),
  views: {},
  exports: {},
  async initialize() {
    return undefined;
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({ parameters: { schema: {}, defaults: {} } });
  },
  async evaluate() {
    return { handle: undefined };
  },
});

describe('defineNativeKernelDeployment', () => {
  it('should give the deployment its entry and the package root above the defining module, typed by its options', () => {
    const deployment = defineNativeKernelDeployment(deploymentInput);

    expect(deployment).toMatchObject({
      package: '@acme/worker-kernel',
      ecosystem: 'none',
      manifest,
      entry: 'file:///packages/worker-kernel/src/native.ts',
      packageRoot: 'file:///packages/worker-kernel/',
    });
    expect(deployment).not.toHaveProperty('seal');
    expect(deployment.optionsSchema.parse(deployment.optionsFromClosure(closure))).toEqual({
      executable: '/store/closures/sha256/abc/bin/worker',
      runtimePath: '/store/closures/sha256/abc',
    });
    expectTypeOf(deployment).toEqualTypeOf<
      NativeKernelDeployment<{ executable: string; runtimePath: string }, '@acme/worker-kernel'>
    >();
  });

  it('should resolve an explicit package root against the defining module', () => {
    expect(
      defineNativeKernelDeployment({
        ...deploymentInput,
        moduleUrl: 'file:///pkg/dist/native/index.mjs',
        packageRoot: '../..',
      }).packageRoot,
    ).toBe('file:///pkg/');
    expect(defineNativeKernelDeployment({ ...deploymentInput, packageRoot: 'file:///elsewhere' }).packageRoot).toBe(
      'file:///elsewhere/',
    );
  });

  it('should refuse a package name that is not a scoped npm name', () => {
    expect(() => defineNativeKernelDeployment({ ...deploymentInput, package: 'worker-kernel' })).toThrow(
      new TypeError("A native kernel deployment's package must be a scoped npm package name, got 'worker-kernel'."),
    );
    expect(() => defineNativeKernelDeployment({ ...deploymentInput, package: '@Acme/Worker' })).toThrow(TypeError);
  });

  it('should refuse a launch set that names a path outside the closure', () => {
    expect(() =>
      defineNativeKernelDeployment({
        ...deploymentInput,
        launchSet: () => [
          'bin/worker',
          '/usr/bin/python3',
          '../escape',
          String.raw`bin\worker.exe`,
          'bin//worker',
          './bin',
          '',
        ],
      }),
    ).toThrow(
      new TypeError(
        String.raw`@acme/worker-kernel's launch set must hold closure-relative POSIX paths, got '/usr/bin/python3', '../escape', 'bin\worker.exe', 'bin//worker', './bin', ''.`,
      ),
    );
  });

  it('should accept a pattern-based launch set that names nothing for an empty closure', () => {
    const deployment = defineNativeKernelDeployment({
      ...deploymentInput,
      launchSet: (files) => files.map(({ path }) => path),
    });

    expect(deployment.launchSet(closure.files)).toEqual(['bin/worker']);
  });
});

describe('withNativeDeployment', () => {
  const deployment = defineNativeKernelDeployment(deploymentInput);
  const kernel = withNativeDeployment(workerKernel, deployment);

  it('should carry the deployment on every registration, invisibly, and keep the factory signature', () => {
    const registration = kernel({ requestTimeout: 5 });

    expect(nativeDeploymentOf(registration)).toBe(deployment);
    expect(Object.keys(registration)).not.toContain('deployment');
    expect({ ...registration }).toEqual({ ...workerKernel({ requestTimeout: 5 }) });
    expect(nativeDeploymentOf(workerKernel())).toBeUndefined();
    expectTypeOf(kernel).toEqualTypeOf<typeof workerKernel>();
  });

  it('should keep the deployment through definePlugin and resolveRuntimeDefinition', async () => {
    const plugin = definePlugin({
      meta: { name: '@acme/worker-kernel' },
      kernels: { default: kernel },
      presets: { default: ['kernels.default'] },
    });

    const listed = await resolveRuntimeDefinition(defineRuntime({ plugins: [plugin()] }), undefined);
    const configured = await resolveRuntimeDefinition(
      defineRuntime({ plugins: [plugin({ kernels: { default: { requestTimeout: 1000 } } })] }),
      undefined,
    );

    expect(listed.kernels.map((registration) => nativeDeploymentOf(registration))).toEqual([deployment]);
    expect(configured.kernels[0]).toMatchObject({ id: 'worker', options: { requestTimeout: 1000 } });
    expect(nativeDeploymentOf(configured.kernels[0]!)).toBe(deployment);
  });

  it('should refuse a registration whose kernel or extensions the manifest does not declare', () => {
    const undeclared = defineNativeKernelDeployment({
      ...deploymentInput,
      manifest: { ...manifest, kernels: { other: { requires: ['engine'], extensions: ['wk'] } } },
    });
    const narrower = defineNativeKernelDeployment({
      ...deploymentInput,
      manifest: { ...manifest, kernels: { worker: { requires: ['engine'], extensions: ['wkx'] } } },
    });

    expect(() => withNativeDeployment(workerKernel, undeclared)()).toThrow(
      new TypeError("@acme/worker-kernel's tau-plugin.json declares no kernel 'worker'."),
    );
    expect(() => withNativeDeployment(workerKernel, narrower)()).toThrow(
      new TypeError("@acme/worker-kernel's tau-plugin.json does not declare kernel 'worker' for 'wk'."),
    );
  });

  it('should read no deployment from an object without one', () => {
    expect(nativeDeploymentOf({ id: 'replicad' })).toBeUndefined();
  });
});
