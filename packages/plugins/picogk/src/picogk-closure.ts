import { join } from 'node:path';

import type { ClosureReceipt } from '@taucad/runtime/preparation/node';

import type { PicogkKernelOptions } from '#picogk-resources.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';

/** Microsoft's `dotnet` muxer, unpacked from the runtime archive (the `dotnet` payload's destination). */
const muxerPath = 'dotnet/dotnet';
/** The framework-dependent worker the muxer runs, unpacked from the Tau layer (the `worker` payload's destination). */
const workerAssemblyPath = 'tau-worker/Tau.PicoGK.Worker.dll';

/*
 * The files hashed at every launch besides the muxer: the worker's entry assets, the hosts that load the runtime and
 * every native library the worker can load. The rest of the closure was verified when it was sealed (D8, I11).
 */
const launchResources: ReadonlyArray<{ readonly pattern: RegExp; readonly required?: string }> = [
  { pattern: /^tau-worker\/Tau\.PicoGK\.Worker\.dll$/u, required: workerAssemblyPath },
  {
    pattern: /^tau-worker\/Tau\.PicoGK\.Worker\.runtimeconfig\.json$/u,
    required: 'tau-worker/Tau.PicoGK.Worker.runtimeconfig.json',
  },
  { pattern: /^tau-worker\/Tau\.PicoGK\.Worker\.deps\.json$/u },
  { pattern: /^tau-worker\/PicoGK\.dll$/u, required: 'tau-worker/PicoGK.dll' },
  { pattern: /^tau-worker\/[^/]+\.(?:dylib|so)$/u },
  {
    pattern: /^dotnet\/host\/fxr\/[^/]+\/libhostfxr\.(?:dylib|so)$/u,
    required: 'dotnet/host/fxr/<version>/libhostfxr',
  },
  {
    pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/libhostpolicy\.(?:dylib|so)$/u,
    required: 'dotnet/shared/Microsoft.NETCore.App/<version>/libhostpolicy',
  },
  {
    pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/libcoreclr\.(?:dylib|so)$/u,
    required: 'dotnet/shared/Microsoft.NETCore.App/<version>/libcoreclr',
  },
  { pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/libclrjit\.(?:dylib|so)$/u },
  {
    pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/System\.Private\.CoreLib\.dll$/u,
    required: 'dotnet/shared/Microsoft.NETCore.App/<version>/System.Private.CoreLib.dll',
  },
];

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
 * @param receipt - The receipt of the `runtime` dependency of `@taucad/picogk`, from a preparation host.
 * @returns Absolute, integrity-pinned kernel options.
 * @throws When the receipt lacks a file the launch needs; `tau prepare picogk --verify` repairs the closure.
 * @public
 */
export const picogkOptionsFromClosure = (receipt: ClosureReceipt): PicogkClosureOptions => {
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
  const resourceFiles = [...files]
    .filter(([path]) => launchResources.some(({ pattern }) => pattern.test(path)))
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([path, sha256]) => ({ relativePath: path, path: join(receipt.root, path), sha256 }));
  for (const { pattern, required } of launchResources) {
    if (required !== undefined && !resourceFiles.some(({ relativePath }) => pattern.test(relativePath))) {
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
