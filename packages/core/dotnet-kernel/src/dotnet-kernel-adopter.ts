/**
 * The adopter of a native .NET kernel: a kernel package's `/native` subpath supplies its package name, closure layout
 * and `load()`, and the launch set, the closure-to-options mapping and the options schema follow from the layout.
 *
 * Imports no session code, so a host's roster of adopters stays light until a host calls `load()`.
 *
 * @module
 */
import { defineNativeKernelAdopter } from '@taucad/native-process-core/adopter';
import type { NativeKernelAdopter, NativeKernelPluginFactory } from '@taucad/native-process-core/adopter';

import { dotnetLaunchSet, dotnetOptionsFromClosure } from '#dotnet-closure.js';
import type { DotnetClosureLayout } from '#dotnet-closure.js';
import { dotnetClosureOptionsSchema } from '#dotnet.schemas.js';
import type { DotnetClosureOptions } from '#dotnet.schemas.js';

/**
 * What a .NET kernel package states about itself to become a native kernel adopter.
 * @public
 */
export type DotnetKernelAdopterInput<Package extends string> = DotnetClosureLayout & {
  /** The npm package name, such as `@taucad/picogk`. */
  readonly package: Package;
  /** Import the kernel and return its plugin factory, through a same-package dynamic import. */
  readonly load: () => Promise<NativeKernelPluginFactory<DotnetClosureOptions>>;
};

/**
 * Define the adopter of a native .NET kernel. Its projects are NuGet projects, it has no seal step (ReadyToRun
 * compilation happens when its layer is built, D22), and Microsoft's `dotnet` muxer runs its worker assembly.
 *
 * @param input - The package name, closure layout and `load()`.
 * @returns A native kernel adopter for the host roster.
 * @throws {TypeError} When `package` is not a scoped npm package name.
 * @public
 */
export const defineDotnetKernelAdopter = <Package extends string>(
  input: DotnetKernelAdopterInput<Package>,
): NativeKernelAdopter<DotnetClosureOptions, Package> => {
  const { package: packageName, load, ...layout } = input;
  return defineNativeKernelAdopter({
    package: packageName,
    ecosystem: 'nuget',
    optionsSchema: dotnetClosureOptionsSchema,
    optionsFromClosure: dotnetOptionsFromClosure(layout),
    launchSet: dotnetLaunchSet(layout),
    load,
  });
};
