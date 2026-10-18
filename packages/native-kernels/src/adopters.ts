/**
 * The native kernels Tau ships, in order. This tuple is the one decision every host follows: membership and order
 * among native kernels. Hosts iterate it and never name a kernel.
 *
 * @module
 */
import { build123dNative } from '@taucad/build123d/native';
import type {
  NativeKernelAdopter,
  NativeKernelBounds,
  NativeKernelDeployment,
} from '@taucad/native-process-core/adopter';
import type { PluginInstance } from '@taucad/runtime/plugin';
import type { ClosureLaunch } from '@taucad/runtime/preparation/node';
import { picogkNative } from '@taucad/picogk/native';

import type { UnavailableNativeKernel } from '#unavailable-kernels.js';

/**
 * A roster adopter over a package's deployment: `load()` binds the plugin to the composed closure explicitly, as the
 * kernel's `closure` option.
 * @param deployment - The package's deployment.
 * @param plugin - Import the package's plugin factory.
 * @returns The adopter.
 */
const rosterAdopter = <Options extends Record<string, unknown>, Package extends string>(
  deployment: NativeKernelDeployment<Options, Package>,
  plugin: () => Promise<(options: { readonly closure: Options } & NativeKernelBounds) => PluginInstance>,
): NativeKernelAdopter<Options, Package> => ({
  package: deployment.package,
  ecosystem: deployment.ecosystem,
  optionsSchema: deployment.optionsSchema,
  optionsFromClosure: deployment.optionsFromClosure,
  ...(deployment.seal && { seal: deployment.seal }),
  launchSet: deployment.launchSet,
  load: async () => {
    const factory = await plugin();
    return ({ requestTimeout, maxArtifactBytes, ...closure }) =>
      factory({
        closure: closure as unknown as Options,
        ...(requestTimeout === undefined ? {} : { requestTimeout }),
        ...(maxArtifactBytes === undefined ? {} : { maxArtifactBytes }),
      });
  },
});

const build123dAdopter = rosterAdopter(build123dNative, async () => {
  const { build123d } = await import('@taucad/build123d');
  return (options) => build123d({ kernels: { default: options } });
});

const picogkAdopter = rosterAdopter(picogkNative, async () => {
  const { picogk } = await import('@taucad/picogk');
  return (options) => picogk({ kernels: { default: options } });
});

/**
 * Every native kernel package's adopter, in roster order. A shim over each package's deployment until hosts compose
 * natives from their runtime definitions; deleted with this package.
 * @public
 */
export const nativeKernelAdopters: readonly [typeof build123dAdopter, typeof picogkAdopter] = [
  build123dAdopter,
  picogkAdopter,
];

/**
 * The type of {@link nativeKernelAdopters}.
 * @public
 */
export type NativeKernelAdopters = typeof nativeKernelAdopters;

/**
 * The npm package of a native kernel in the roster.
 * @public
 */
export type NativePackage = NativeKernelAdopters[number]['package'];

/**
 * The options a native package's sealed closure maps to.
 * @public
 */
export type OptionsOf<P extends NativePackage> =
  Extract<NativeKernelAdopters[number], { readonly package: P }> extends NativeKernelAdopter<infer O, P> ? O : never;

/**
 * The roster's adopter for a package, or for a union of packages the union of their adopters. Mapped over `P` itself,
 * so a function generic in `P` reads `package` as `P` and the options as `OptionsOf<P>`.
 * @internal
 */
export type AdopterOf<P extends NativePackage = NativePackage> = {
  [Q in P]: NativeKernelAdopter<OptionsOf<Q>, Q>;
}[P];

/**
 * One composed native kernel of a package, or for a union of packages the union of their rows.
 * @internal
 */
export type ComposedNativeKernelOf<P extends NativePackage = NativePackage> = {
  [Q in P]: {
    /** The kernel's npm package. */
    readonly package: Q;
    /** Kernel name, as its `tau-plugin.json` declares it and `tau prepare` takes it. */
    readonly kernel: string;
    /** The sealed closure the kernel runs from. */
    readonly closureRoot: string;
    /** The options its closure maps to. */
    readonly options: OptionsOf<Q>;
  };
}[P];

/**
 * One composed native kernel as a host hands it across a worker or child-process boundary. Discriminated by
 * `package`, so `options` keeps its adopter's type.
 * @public
 */
export type ComposedNativeKernel = ComposedNativeKernelOf;

/**
 * The native kernels a host composes from the payload store, and those it cannot.
 * @public
 */
export type NativeKernelComposition = {
  /** Every kernel whose closure is sealed, in roster order. */
  readonly kernels: readonly ComposedNativeKernel[];
  /** Every declared kernel that is not composed, with why; a host answers its files with the refusal. */
  readonly unavailable: readonly UnavailableNativeKernel[];
  /** The sealed closure each composed kernel runs from; a daemon starts native workers from these alone. */
  readonly closureRoots: readonly string[];
};

/**
 * The roster's adopter for a package name.
 * @internal
 * @param packageName - Any npm package name, such as one read from another process.
 * @returns The adopter, or `undefined` when the package is not in the roster.
 */
export const adopterFor = (packageName: string): AdopterOf | undefined =>
  nativeKernelAdopters.find((adopter) => adopter.package === packageName);

/**
 * The composed row of a sealed closure.
 * @internal
 * @param adopter - The closure's package adopter.
 * @param kernel - The kernel name its `tau-plugin.json` declares.
 * @param closure - The sealed closure's launch view.
 * @returns The row, with the options the adopter maps the closure to.
 */
export const composedRow = <P extends NativePackage>(
  adopter: AdopterOf<P>,
  kernel: string,
  closure: ClosureLaunch,
): ComposedNativeKernelOf<P> => ({
  package: adopter.package,
  kernel,
  closureRoot: closure.root,
  options: adopter.optionsFromClosure(closure),
});
