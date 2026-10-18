/* oxlint-disable no-barrel-files/no-barrel-files -- public `./adopter` entry */
/**
 * What a .NET kernel's `/native` subpath needs: the adopter factory, the closure layout and mapping, and the options
 * schemas. Imports no session code.
 *
 * @module
 */
export { defineDotnetKernelAdopter } from '#dotnet-kernel-adopter.js';
export type { DotnetKernelAdopterInput } from '#dotnet-kernel-adopter.js';
export { dotnetLaunchSet, dotnetOptionsFromClosure } from '#dotnet-closure.js';
export type { DotnetClosureLayout, DotnetLaunchResource } from '#dotnet-closure.js';
export { dotnetClosureOptionsSchema, dotnetKernelOptionsSchema } from '#dotnet.schemas.js';
export type { DotnetClosureOptions, DotnetKernelOptions } from '#dotnet.schemas.js';
