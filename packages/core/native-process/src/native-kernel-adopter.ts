/**
 * The adopter contract every native kernel package exports from its `/native` subpath: how a host maps the closure
 * the preparation host sealed to the kernel's options, which seal step and launch set the preparation host runs, and
 * how the kernel itself loads. Hosts iterate a roster of adopters instead of naming kernels.
 *
 * The subpath imports types only, so a roster of adopters never pulls a kernel into a host's graph before `load()`.
 *
 * @module
 */
import type { PluginInstance } from '@taucad/runtime/plugin';
import type { ClosureLaunch, PreparationPlugin } from '@taucad/runtime/preparation/node';
import type { z } from 'zod';

/**
 * Host policy every native kernel's options accept on top of what its closure gives.
 * @public
 */
export type NativeKernelBounds = {
  /** Reject a request after this duration; zero waits for completion or cancellation. Milliseconds. */
  readonly requestTimeout?: number;
  /** The largest artifact the kernel may return, in bytes. */
  readonly maxArtifactBytes?: number;
};

/**
 * The plugin factory a loaded native kernel package gives a host: the package's toolkit factory, bound to its
 * default kernel.
 * @public
 */
export type NativeKernelPluginFactory<Options extends Record<string, unknown>> = (
  options: Options & NativeKernelBounds,
) => PluginInstance;

/**
 * What a host needs of one native kernel package to prepare, compose and load it. Kernel ids and extensions are not
 * repeated here: they come from the package's `tau-plugin.json`, which a roster pairs with the adopter by `package`.
 * @public
 */
export type NativeKernelAdopter<
  Options extends Record<string, unknown> = Record<string, unknown>,
  Package extends string = string,
> = {
  /** The npm package name, such as `@taucad/build123d`; the `package` its receipts record. */
  readonly package: Package;
  /** The ecosystem of the projects the kernel owns, which picks their project template files. */
  readonly ecosystem: 'pypi' | 'nuget' | 'none';
  /** The options a sealed closure maps to; a host validates them where they cross a process boundary. */
  readonly optionsSchema: z.ZodType<Options>;
  /** Map a sealed closure (its receipt, or a launch view) to the kernel's options. */
  readonly optionsFromClosure: (closure: ClosureLaunch) => Options;
  /** The seal step the preparation host runs before it seals a closure, when the kernel has one. */
  readonly seal?: PreparationPlugin['seal'];
  /** The closure-relative paths every launch hashes, which the preparation host records in the launch index. */
  readonly launchSet: NonNullable<PreparationPlugin['launchSet']>;
  /**
   * Import the kernel and return its plugin factory. A same-package dynamic import, so bundlers split the kernel
   * into its own chunk; a host calls it only when it composes the kernel.
   */
  readonly load: () => Promise<NativeKernelPluginFactory<Options>>;
};

const packageNamePattern = /^@[\d_a-z~-][\d._a-z~-]*\/[\d_a-z~-][\d._a-z~-]*$/u;

const isClosureRelative = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/**
 * Define a native kernel adopter. The options type follows `optionsFromClosure`; the schema and the loaded factory
 * must agree with it. The package name stays a literal type, so a roster of adopters can key options by package.
 *
 * @param adopter - The package's adopter.
 * @returns The same adopter.
 * @throws {TypeError} When `package` is not a scoped npm package name, or the launch set of an empty closure holds a
 *   path that is not closure-relative.
 * @public
 */
export const defineNativeKernelAdopter = <Options extends Record<string, unknown>, Package extends string>(adopter: {
  readonly package: Package;
  readonly ecosystem: NativeKernelAdopter['ecosystem'];
  readonly optionsSchema: z.ZodType<NoInfer<Options>>;
  readonly optionsFromClosure: (closure: ClosureLaunch) => Options;
  readonly seal?: PreparationPlugin['seal'];
  readonly launchSet: NonNullable<PreparationPlugin['launchSet']>;
  readonly load: () => Promise<NativeKernelPluginFactory<NoInfer<Options>>>;
}): NativeKernelAdopter<Options, Package> => {
  if (!packageNamePattern.test(adopter.package)) {
    throw new TypeError(
      `A native kernel adopter's package must be a scoped npm package name, got '${adopter.package}'.`,
    );
  }
  const invalid = adopter.launchSet([]).filter((path) => !isClosureRelative(path));
  if (invalid.length > 0) {
    throw new TypeError(
      `${adopter.package}'s launch set must hold closure-relative POSIX paths, got ${invalid.map((path) => `'${path}'`).join(', ')}.`,
    );
  }
  return adopter;
};
