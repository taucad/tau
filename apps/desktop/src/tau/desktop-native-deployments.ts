/**
 * The native kernel packages the desktop prepares on first use (charter W6 phase 2).
 *
 * The app ships no closure: main prepares each one the first time a model or the agent needs it, and the packaging
 * verification prepares them the same way, so both need each package's `tau-plugin.json` and launch set without
 * loading a kernel. This list imports only
 * the light `/native` subpaths (static manifest JSON and the closure mapping), so main stays kernel-free. It is a
 * packaging fact, not a support gate: the kernel utility's runtime definition (`createDesktopRuntime`) is the source
 * of truth for what runs, and a parity test pins this list to the native deployments that definition lists.
 *
 * @module
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build123dNative } from '@taucad/build123d/native';
import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';
import { picogkNative } from '@taucad/picogk/native';
import { smlibpyNative } from '@taucad/smlibpy/native';

/** The native deployments the desktop runtime lists, in its list order. */
export const desktopNativeDeployments: readonly NativeKernelDeployment[] = [
  smlibpyNative,
  build123dNative,
  picogkNative,
];

/**
 * Where a packaged app keeps each native package's own payload files (its `packagePath` payloads: the worker and its
 * support modules), under the app's resources, one directory per package name.
 */
export const nativePackageResources = 'native-packages';

/**
 * The deployments with each package root at a directory that holds the package's own payload files. Main is bundled,
 * so the root a deployment derives from its module URL names the bundle, not the package: the packaged app reads the
 * copies packaging stages under its resources, and a development build reads the installed package.
 * @param input - Whether the app is packaged, and its resources directory.
 * @returns The deployments to prepare from.
 */
export const preparableNativeDeployments = (
  input: Readonly<{ packaged: boolean; resourcesPath: string }>,
): readonly NativeKernelDeployment[] => {
  const require = createRequire(import.meta.url);
  return desktopNativeDeployments.map((deployment) => ({
    ...deployment,
    packageRoot: pathToFileURL(
      `${
        input.packaged
          ? join(input.resourcesPath, nativePackageResources, deployment.package)
          : dirname(require.resolve(`${deployment.package}/tau-plugin.json`))
      }/`,
    ).href,
  }));
};
