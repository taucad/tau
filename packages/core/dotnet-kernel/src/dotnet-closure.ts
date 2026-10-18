import { join } from 'node:path';

import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';

import { dotnetClosureSchema } from '#dotnet.schemas.js';
import type { DotnetClosureOptions } from '#dotnet.schemas.js';

/** Microsoft's `dotnet` muxer, unpacked from the runtime archive (a `dotnet` payload with destination `dotnet`). */
const muxerPath = 'dotnet/dotnet';

/**
 * One file the process loads before the worker can answer its handshake, matched by pattern because its path carries
 * a version.
 * @public
 */
export type DotnetLaunchResource = {
  /** Matches the closure-relative path. */
  readonly pattern: RegExp;
  /** How a repair message names the file when no row matches, such as `tau-worker/picogk.<version>.dylib`. */
  readonly required: string;
};

/**
 * Where a kernel's files sit in its sealed closure. The muxer, `hostfxr` and `hostpolicy` are the same for every .NET
 * kernel; the worker assembly and the files its layer loads first are the kernel's.
 * @public
 */
export type DotnetClosureLayout = {
  /** The kernel id `tau prepare` takes, named in the repair message. */
  readonly kernel: string;
  /** The kernel's display name, such as `PicoGK`, used in messages and resource labels. */
  readonly displayName: string;
  /** Closure-relative path of the framework-dependent worker assembly, such as `tau-worker/Tau.PicoGK.Worker.dll`. */
  readonly workerAssembly: string;
  /** The kernel's own launch resources besides the worker assembly: its library and native engine. */
  readonly resources: readonly DotnetLaunchResource[];
};

/** The .NET host files every framework-dependent worker loads first. */
const hostResources: readonly DotnetLaunchResource[] = [
  {
    pattern: /^dotnet\/host\/fxr\/[^/]+\/libhostfxr\.(?:dylib|so)$/u,
    required: 'dotnet/host/fxr/<version>/libhostfxr',
  },
  {
    pattern: /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/libhostpolicy\.(?:dylib|so)$/u,
    required: 'dotnet/shared/Microsoft.NETCore.App/<version>/libhostpolicy',
  },
];

const exactly = (path: string): RegExp =>
  new RegExp(`^${path.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)}$`, 'u');

/*
 * The files hashed at every launch besides the muxer (D8, ruling X29): those the process loads first, before the
 * worker can answer its handshake. Every other file (the framework assemblies, CoreCLR, the JIT, the kernel's other
 * dependencies) was verified when the closure was sealed and is re-verified, by name, when the worker exits before
 * its handshake (I11).
 */
const launchResources = (layout: DotnetClosureLayout): readonly DotnetLaunchResource[] => [
  ...hostResources,
  { pattern: exactly(layout.workerAssembly), required: layout.workerAssembly },
  ...layout.resources,
];

const launchRows = (resources: readonly DotnetLaunchResource[], files: readonly ReceiptFile[]): ReceiptFile[] =>
  files.filter((file) => file.symlinkTarget === undefined && resources.some(({ pattern }) => pattern.test(file.path)));

/**
 * The launch set of a .NET kernel (D8, ruling X29): the `dotnet` muxer, `hostfxr`, `hostpolicy`, the worker assembly
 * and the layout's resources. The preparation host records their rows in the closure's launch index, which every
 * launch reads and hashes; the rest of the closure is re-verified when the worker exits before its handshake.
 * @param layout - Where the kernel's files sit in its closure.
 * @returns The adopter's `launchSet`: every row of the sealed closure to closure-relative paths, sorted.
 * @public
 */
export const dotnetLaunchSet = (
  layout: DotnetClosureLayout,
): ((files: readonly ReceiptFile[]) => readonly string[]) => {
  const resources = launchResources(layout);
  return (files) => [muxerPath, ...launchRows(resources, files).map(({ path }) => path)].toSorted();
};

/**
 * Map a sealed .NET closure to the options the kernel takes: Microsoft's `dotnet` muxer runs the worker assembly
 * (D6), the closure root is the sandbox's readable runtime root, and each launch hashes the muxer and the named
 * resources against the digests the receipt recorded.
 * @param layout - Where the kernel's files sit in its closure.
 * @returns The adopter's `optionsFromClosure`. It takes the closure's receipt, or the launch view a preparation host's
 *   `inspectLaunch` reads from its launch index, returns absolute, integrity-pinned options, and throws when the
 *   receipt lacks a file the launch needs, naming `tau prepare <kernel> --verify` as the repair.
 * @public
 */
export const dotnetOptionsFromClosure = (
  layout: DotnetClosureLayout,
): ((receipt: ClosureLaunch) => DotnetClosureOptions) => {
  const resources = launchResources(layout);
  return (receipt) => {
    const files = new Map(
      receipt.files.filter((file) => file.symlinkTarget === undefined).map((file) => [file.path, file.sha256]),
    );
    const missing = (path: string): Error =>
      new Error(
        `The ${layout.displayName} closure at ${receipt.root} has no ${path}. Run \`tau prepare ${layout.kernel} --verify\` to repair it.`,
      );
    const muxerSha256 = files.get(muxerPath);
    if (muxerSha256 === undefined) {
      throw missing(muxerPath);
    }
    const resourceFiles = launchRows(resources, receipt.files)
      .toSorted((left, right) => (left.path < right.path ? -1 : 1))
      .map(({ path, sha256 }) => ({ relativePath: path, path: join(receipt.root, path), sha256 }));
    for (const { pattern, required } of resources) {
      if (!resourceFiles.some(({ relativePath }) => pattern.test(relativePath))) {
        throw missing(required);
      }
    }
    const options = dotnetClosureSchema.parse({
      workerExecutable: join(receipt.root, muxerPath),
      workerSha256: muxerSha256,
      resourceFiles: resourceFiles.map(({ relativePath, path, sha256 }) => ({
        path,
        sha256,
        label: `${layout.displayName} closure ${relativePath}`,
      })),
    });
    return { ...options, runtimePath: receipt.root, workerArguments: [join(receipt.root, layout.workerAssembly)] };
  };
};
