import { join } from 'node:path';

import { definePlugin } from '@taucad/runtime/plugin';
import type { ClosureLaunch } from '@taucad/runtime/preparation/node';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineNativeKernelAdopter } from '#native-kernel-adopter.js';
import type { NativeKernelAdopter, NativeKernelBounds } from '#native-kernel-adopter.js';

const optionsSchema = z.object({ executable: z.string(), runtimePath: z.string() });

const closure: ClosureLaunch = {
  package: '@acme/worker-kernel',
  dependency: 'engine',
  root: '/store/closures/sha256/abc',
  closureIntegrity: `sha256-${'a'.repeat(44)}`,
  files: [{ path: 'bin/worker', byteLength: 3, sha256: 'b'.repeat(64), mode: 0o755 }],
};

const loaded = definePlugin({ meta: { name: '@acme/worker-kernel' }, presets: { default: [] } })();

const adopterInput = {
  package: '@acme/worker-kernel',
  ecosystem: 'none',
  optionsSchema,
  optionsFromClosure: ({ root }: ClosureLaunch) => ({ executable: join(root, 'bin', 'worker'), runtimePath: root }),
  launchSet: () => ['bin/worker'],
  load: async () => (_options: z.output<typeof optionsSchema> & NativeKernelBounds) => loaded,
} as const;

describe('defineNativeKernelAdopter', () => {
  it('should return the adopter it was given, typed by the options its closure maps to', async () => {
    const adopter = defineNativeKernelAdopter(adopterInput);

    expect(adopter).toBe(adopterInput);
    expect(adopter.optionsSchema.parse(adopter.optionsFromClosure(closure))).toEqual({
      executable: '/store/closures/sha256/abc/bin/worker',
      runtimePath: '/store/closures/sha256/abc',
    });
    const factory = await adopter.load();
    expect(factory({ ...adopter.optionsFromClosure(closure), requestTimeout: 1000 })).toBe(loaded);
    expectTypeOf(adopter).toEqualTypeOf<
      NativeKernelAdopter<{ executable: string; runtimePath: string }, '@acme/worker-kernel'>
    >();
  });

  it('should refuse a package name that is not a scoped npm name', () => {
    expect(() => defineNativeKernelAdopter({ ...adopterInput, package: 'worker-kernel' })).toThrow(
      new TypeError("A native kernel adopter's package must be a scoped npm package name, got 'worker-kernel'."),
    );
    expect(() => defineNativeKernelAdopter({ ...adopterInput, package: '@Acme/Worker' })).toThrow(TypeError);
  });

  it('should refuse a launch set that names a path outside the closure', () => {
    expect(() =>
      defineNativeKernelAdopter({
        ...adopterInput,
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
    const adopter = defineNativeKernelAdopter({ ...adopterInput, launchSet: (files) => files.map(({ path }) => path) });

    expect(adopter.launchSet(closure.files)).toEqual(['bin/worker']);
  });
});
