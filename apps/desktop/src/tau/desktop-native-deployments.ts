/**
 * The native kernel packages the desktop bundles closures for (charter W6 phase 1).
 *
 * Main seeds its payload store from the closures `Contents/Resources/payloads` ships and the packaging scripts seal
 * them, so both need each package's `tau-plugin.json` and launch set without loading a kernel. This list imports only
 * the light `/native` subpaths (static manifest JSON and the closure mapping), so main stays kernel-free. It is a
 * packaging fact, not a support gate: the kernel utility's runtime definition (`createDesktopRuntime`) is the source
 * of truth for what runs, and a parity test pins this list to the native deployments that definition lists.
 *
 * @module
 */
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
