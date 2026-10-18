import { dotnetLaunchSet, dotnetOptionsFromClosure } from '@taucad/dotnet-kernel-core/adopter';
import type { DotnetClosureLayout, DotnetClosureOptions } from '@taucad/dotnet-kernel-core/adopter';

/**
 * Where PicoGK's files sit in its sealed closure: the Tau layer unpacks to `tau-worker/` beside Microsoft's `dotnet/`
 * runtime (D6). Besides the muxer, `hostfxr`, `hostpolicy` and the worker assembly, every launch hashes the two files
 * the worker loads before its handshake (D8, ruling X29): `PicoGK.dll` and the native engine. SkiaSharp and Roslyn
 * were verified when the closure was sealed and are re-verified, by name, when the worker exits before its handshake
 * (I11).
 */
export const picogkClosureLayout = {
  kernel: 'picogk',
  displayName: 'PicoGK',
  workerAssembly: 'tau-worker/Tau.PicoGK.Worker.dll',
  resources: [
    { pattern: /^tau-worker\/PicoGK\.dll$/u, required: 'tau-worker/PicoGK.dll' },
    { pattern: /^tau-worker\/picogk[^/]*\.(?:dylib|so)$/u, required: 'tau-worker/picogk.<version>.dylib' },
  ],
} as const satisfies DotnetClosureLayout;

/**
 * PicoGK's launch set (D8, ruling X29): the `dotnet` muxer, `hostfxr`, `hostpolicy`, the worker assembly, `PicoGK.dll`
 * and the native engine. The preparation host records their rows in the closure's launch index, which every launch
 * reads and hashes; the rest of the closure is re-verified when the worker exits before its handshake.
 * @param files - Every row of the sealed closure.
 * @returns Closure-relative paths, sorted.
 * @public
 */
export const picogkLaunchSet = dotnetLaunchSet(picogkClosureLayout);

/** Kernel options for a PicoGK worker launched from a prepared closure. @public */
export type PicogkClosureOptions = DotnetClosureOptions;

/**
 * Map a sealed PicoGK closure to the options the kernel takes: Microsoft's `dotnet` muxer runs the Tau worker
 * assembly (D6), the closure root is the sandbox's readable runtime root, and each launch hashes the muxer and the
 * named resources against the digests the receipt recorded.
 *
 * @param receipt - The `runtime` closure of `@taucad/picogk`: its receipt, or the launch view a preparation host's
 *   `inspectLaunch` reads from its launch index.
 * @returns Absolute, integrity-pinned kernel options.
 * @throws When the receipt lacks a file the launch needs; `tau prepare picogk --verify` repairs the closure.
 * @public
 */
export const picogkOptionsFromClosure = dotnetOptionsFromClosure(picogkClosureLayout);
