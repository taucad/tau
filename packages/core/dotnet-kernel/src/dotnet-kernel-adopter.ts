/**
 * The deployment of a native .NET kernel: a kernel package's `/native` subpath supplies its package name,
 * `tau-plugin.json`, defining module and closure layout, and the launch set, the closure-to-options mapping and the
 * options schema follow from the layout.
 *
 * Imports no session code, so a host or a parent process can load the deployment without the kernel.
 *
 * @module
 */
import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';
import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';

import { dotnetLaunchSet, dotnetOptionsFromClosure } from '#dotnet-closure.js';
import type { DotnetClosureLayout } from '#dotnet-closure.js';
import { dotnetClosureOptionsSchema } from '#dotnet.schemas.js';
import type { DotnetClosureOptions } from '#dotnet.schemas.js';

/**
 * What a .NET kernel package states about itself to deploy a native kernel.
 * @public
 */
export type DotnetKernelAdopterInput<Package extends string> = DotnetClosureLayout & {
  /** The npm package name, such as `@taucad/picogk`. */
  readonly package: Package;
  /** The package's unparsed `tau-plugin.json`. */
  readonly manifest: unknown;
  /** The defining module's `import.meta.url`. */
  readonly moduleUrl: string;
  /** The package root, when it is not the directory above the defining module. */
  readonly packageRoot?: string;
};

/**
 * A native .NET kernel's deployment, with the kernel id its layout names.
 * @public
 */
export type DotnetKernelAdopter<Package extends string = string> = NativeKernelDeployment<
  DotnetClosureOptions,
  Package
> & {
  /** The kernel id `tau prepare` takes. */
  readonly kernel: string;
};

/**
 * Define the deployment of a native .NET kernel. Its projects are NuGet projects, it has no seal step (ReadyToRun
 * compilation happens when its layer is built, D22), and Microsoft's `dotnet` muxer runs its worker assembly.
 *
 * @param input - The package name, its `tau-plugin.json`, the defining module and the closure layout.
 * @returns The deployment.
 * @throws {TypeError} When `package` is not a scoped npm package name.
 * @public
 */
export const defineDotnetKernelAdopter = <Package extends string>(
  input: DotnetKernelAdopterInput<Package>,
): DotnetKernelAdopter<Package> => {
  const { package: packageName, manifest, moduleUrl, packageRoot, ...layout } = input;
  const deployment = defineNativeKernelDeployment({
    package: packageName,
    ecosystem: 'nuget',
    manifest,
    moduleUrl,
    ...(packageRoot === undefined ? {} : { packageRoot }),
    optionsSchema: dotnetClosureOptionsSchema,
    optionsFromClosure: dotnetOptionsFromClosure(layout),
    launchSet: dotnetLaunchSet(layout),
  });
  return { ...deployment, kernel: layout.kernel };
};
