import { join } from 'node:path';

import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';

import type { PicogkKernelOptions } from '#picogk-resources.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';

/** Microsoft's `dotnet` muxer, unpacked from the runtime archive (the `dotnet` payload's destination). */
const muxerPath = 'dotnet/dotnet';
/** The framework-dependent worker the muxer runs, unpacked from the Tau layer (the `worker` payload's destination). */
const workerAssemblyPath = 'tau-worker/Tau.PicoGK.Worker.dll';

/*
 * The files hashed at every launch besides the muxer (D8, ruling X29): those the process loads first, before the
 * worker can answer its handshake. The hosts that load the runtime, the worker assembly, PicoGK and the native engine.
 * Every other file (the framework assemblies, CoreCLR, the JIT, SkiaSharp, Roslyn) was verified when the closure was
 * sealed and is re-verified, by name, when the worker exits before its handshake (I11).
 */
const launchResources: ReadonlyArray<{ readonly pattern: RegExp; readonly required: string }> = [
  {
    pattern: /^dotnet\/host\/fxr\/[^/]+\/libhostfxr\.(?:dylib|so)$/u,
    required: 'dotnet/host/fxr/<version>/libhostfxr',
  },
  {
    pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/libhostpolicy\.(?:dylib|so)$/u,
    required: 'dotnet/shared/Microsoft.NETCore.App/<version>/libhostpolicy',
  },
  { pattern: /^tau-worker\/Tau\.PicoGK\.Worker\.dll$/u, required: workerAssemblyPath },
  { pattern: /^tau-worker\/PicoGK\.dll$/u, required: 'tau-worker/PicoGK.dll' },
  { pattern: /^tau-worker\/picogk[^/]*\.(?:dylib|so)$/u, required: 'tau-worker/picogk.<version>.dylib' },
];

const launchRows = (files: readonly ReceiptFile[]): ReceiptFile[] =>
  files.filter(
    (file) => file.symlinkTarget === undefined && launchResources.some(({ pattern }) => pattern.test(file.path)),
  );

/**
 * PicoGK's launch set (D8, ruling X29): the `dotnet` muxer, `hostfxr`, `hostpolicy`, the worker assembly, `PicoGK.dll`
 * and the native engine. The preparation host records their rows in the closure's launch index, which every launch
 * reads and hashes; the rest of the closure is re-verified when the worker exits before its handshake.
 * @param files - Every row of the sealed closure.
 * @returns Closure-relative paths, sorted.
 * @public
 */
export const picogkLaunchSet = (files: readonly ReceiptFile[]): readonly string[] =>
  [muxerPath, ...launchRows(files).map(({ path }) => path)].toSorted();

/** Kernel options for a PicoGK worker launched from a prepared closure. @public */
export type PicogkClosureOptions = PicogkKernelOptions & {
  readonly runtimePath: string;
  readonly workerArguments: readonly string[];
};

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
export const picogkOptionsFromClosure = (receipt: ClosureLaunch): PicogkClosureOptions => {
  const files = new Map(
    receipt.files.filter((file) => file.symlinkTarget === undefined).map((file) => [file.path, file.sha256]),
  );
  const missing = (path: string): Error =>
    new Error(
      `The PicoGK closure at ${receipt.root} has no ${path}. Run \`tau prepare picogk --verify\` to repair it.`,
    );
  const muxerSha256 = files.get(muxerPath);
  if (muxerSha256 === undefined) {
    throw missing(muxerPath);
  }
  const resourceFiles = launchRows(receipt.files)
    .toSorted((left, right) => (left.path < right.path ? -1 : 1))
    .map(({ path, sha256 }) => ({ relativePath: path, path: join(receipt.root, path), sha256 }));
  for (const { pattern, required } of launchResources) {
    if (!resourceFiles.some(({ relativePath }) => pattern.test(relativePath))) {
      throw missing(required);
    }
  }
  const options = picogkOptionsSchema.parse({
    workerExecutable: join(receipt.root, muxerPath),
    workerSha256: muxerSha256,
    resourceFiles: resourceFiles.map(({ relativePath, path, sha256 }) => ({
      path,
      sha256,
      label: `PicoGK closure ${relativePath}`,
    })),
  });
  return { ...options, runtimePath: receipt.root, workerArguments: [join(receipt.root, workerAssemblyPath)] };
};
