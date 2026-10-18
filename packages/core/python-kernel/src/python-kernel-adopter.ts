import { defineNativeKernelAdopter } from '@taucad/native-process-core/adopter';
import type { NativeKernelAdopter, NativeKernelPluginFactory } from '@taucad/native-process-core/adopter';
import type { PreparationPlugin } from '@taucad/runtime/preparation/node';
import type { z } from 'zod';

import { createPythonSeal, pythonLaunchSet, pythonOptionsFromClosure } from '#python-closure.js';
import type { PythonClosureOptions } from '#python-closure.js';
import { pythonKernelOptionsSchema } from '#python-kernel.js';
import type { PythonKernelWorker } from '#python-kernel.js';

/**
 * A Python kernel's adopter: the native adopter contract, with the seal step every Python closure runs and what the
 * shared payload and project template generators read from it.
 * @public
 */
export type PythonKernelAdopter<Package extends string = string> = NativeKernelAdopter<
  PythonClosureOptions,
  Package
> & {
  readonly seal: NonNullable<PreparationPlugin['seal']>;
  /** The kernel's worker: its id, display name and the modules its closure carries beside `tau_kernel`. */
  readonly worker: PythonKernelWorker;
  /** The modules the seal's self-test imports to prove the closure loads on the host. */
  readonly selfTestImports: readonly [string, ...string[]];
  /** The libraries a project pins in `pyproject.toml`, `name → version`, at the versions the kernel runs. */
  readonly projectLibraries: Readonly<Record<string, string>>;
};

/**
 * Define a Python kernel's adopter from its worker: the launch set, the closure-to-options mapping and the seal step
 * (compileall, then `import <selfTestImports>` in the sandbox) all follow from it.
 *
 * @param adopter - The package, its worker, the modules the seal's self-test imports, the libraries a project pins,
 *   an optional options schema (default: `pythonKernelOptionsSchema` over the worker's support modules, with
 *   `runtimePath` required) and the kernel's lazy `load`.
 * @returns The adopter.
 * @throws {TypeError} When `package` is not a scoped npm package name.
 * @public
 */
export const definePythonKernelAdopter = <Package extends string>(adopter: {
  readonly package: Package;
  readonly worker: PythonKernelWorker;
  readonly selfTestImports: readonly [string, ...string[]];
  readonly projectLibraries: Readonly<Record<string, string>>;
  readonly optionsSchema?: z.ZodType<PythonClosureOptions>;
  readonly load: () => Promise<NativeKernelPluginFactory<PythonClosureOptions>>;
}): PythonKernelAdopter<Package> => {
  const seal = createPythonSeal({ worker: adopter.worker, selfTestImports: adopter.selfTestImports });
  const native = defineNativeKernelAdopter<PythonClosureOptions, Package>({
    package: adopter.package,
    ecosystem: 'pypi',
    optionsSchema:
      adopter.optionsSchema ??
      pythonKernelOptionsSchema({ supportModules: adopter.worker.workerModules.slice(1) }).required({
        runtimePath: true,
      }),
    optionsFromClosure: pythonOptionsFromClosure(adopter.worker),
    seal,
    launchSet: pythonLaunchSet(adopter.worker),
    load: adopter.load,
  });
  return {
    ...native,
    seal,
    worker: adopter.worker,
    selfTestImports: adopter.selfTestImports,
    projectLibraries: adopter.projectLibraries,
  };
};
