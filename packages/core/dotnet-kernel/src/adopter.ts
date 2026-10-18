/* oxlint-disable no-barrel-files/no-barrel-files -- public `./adopter` entry */
/**
 * What a .NET kernel's `/native` subpath needs: the deployment factory, the closure layout and mapping, and the options
 * schemas. Imports no session code.
 *
 * @module
 */
export { defineDotnetKernelAdopter } from '#dotnet-kernel-adopter.js';
export type { DotnetKernelAdopter, DotnetKernelAdopterInput } from '#dotnet-kernel-adopter.js';
export { dotnetLaunchSet, dotnetOptionsFromClosure } from '#dotnet-closure.js';
export type { DotnetClosureLayout, DotnetLaunchResource } from '#dotnet-closure.js';
export { dotnetClosureOptionsSchema, dotnetClosureSchema, dotnetKernelOptionsSchema } from '#dotnet.schemas.js';
export type { DotnetClosure, DotnetClosureOptions, DotnetKernelOptions } from '#dotnet.schemas.js';
