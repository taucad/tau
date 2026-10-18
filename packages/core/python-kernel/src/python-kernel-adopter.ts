import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';
import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';
import type { PreparationPlugin } from '@taucad/runtime/preparation/node';
import type { z } from 'zod';

import { createPythonSeal, pythonLaunchSet, pythonOptionsFromClosure } from '#python-closure.js';
import type { PythonClosureOptions } from '#python-closure.js';
import { pythonClosureSchema } from '#python-kernel.js';
import type { PythonKernelWorker } from '#python-kernel.js';

/**
 * A Python kernel's deployment: the native deployment contract, with the seal step every Python closure runs and
 * what the shared payload and project template generators read from it.
 * @public
 */
export type PythonKernelAdopter<Package extends string = string> = NativeKernelDeployment<
  PythonClosureOptions,
  Package
> & {
  readonly seal: NonNullable<PreparationPlugin['seal']>;
  /** The interpreter and every worker module; a Python closure's launch set reads none of its receipt. */
  readonly launchSet: () => readonly string[];
  /** The kernel's worker: its id, display name and the modules its closure carries beside `tau_kernel`. */
  readonly worker: PythonKernelWorker;
  /** The modules the seal's self-test imports to prove the closure loads on the host. */
  readonly selfTestImports: readonly [string, ...string[]];
  /** The libraries a project pins in `pyproject.toml`, `name → version`, at the versions the kernel runs. */
  readonly projectLibraries: Readonly<Record<string, string>>;
};

/**
 * Define a Python kernel's deployment from its worker: the launch set, the closure-to-options mapping and the seal
 * step (compileall, then `import <selfTestImports>` in the sandbox) all follow from it. Export it from the package's
 * light `/native` subpath, and bind it to the kernel with `withNativeDeployment`.
 *
 * @param adopter - The package, its `tau-plugin.json`, the defining module's `import.meta.url` (and, optionally, the
 *   package root it differs from), its worker, the modules the seal's self-test imports, the libraries a project pins
 *   and an optional options schema (default: `pythonClosureSchema` over the worker's support modules, with
 *   `runtimePath` required).
 * @returns The deployment.
 * @throws {TypeError} When `package` is not a scoped npm package name.
 * @public
 */
export const definePythonKernelAdopter = <Package extends string>(adopter: {
  readonly package: Package;
  readonly manifest: unknown;
  readonly moduleUrl: string;
  readonly packageRoot?: string;
  readonly worker: PythonKernelWorker;
  readonly selfTestImports: readonly [string, ...string[]];
  readonly projectLibraries: Readonly<Record<string, string>>;
  readonly optionsSchema?: z.ZodType<PythonClosureOptions>;
}): PythonKernelAdopter<Package> => {
  const seal = createPythonSeal({ worker: adopter.worker, selfTestImports: adopter.selfTestImports });
  const launchSet = pythonLaunchSet(adopter.worker);
  const deployment = defineNativeKernelDeployment<PythonClosureOptions, Package>({
    package: adopter.package,
    ecosystem: 'pypi',
    manifest: adopter.manifest,
    moduleUrl: adopter.moduleUrl,
    ...(adopter.packageRoot === undefined ? {} : { packageRoot: adopter.packageRoot }),
    optionsSchema:
      adopter.optionsSchema ??
      pythonClosureSchema({ supportModules: adopter.worker.workerModules.slice(1) }).required({
        runtimePath: true,
      }),
    optionsFromClosure: pythonOptionsFromClosure(adopter.worker),
    seal,
    launchSet,
  });
  return {
    ...deployment,
    seal,
    launchSet,
    worker: adopter.worker,
    selfTestImports: adopter.selfTestImports,
    projectLibraries: adopter.projectLibraries,
  };
};
