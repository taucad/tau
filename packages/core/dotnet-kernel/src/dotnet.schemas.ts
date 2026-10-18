import { isAbsolute } from 'node:path';

import { z } from 'zod';

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/iu, 'Expected a SHA-256 digest');

/**
 * The files a sandboxed native .NET kernel worker launches from: the executable and its resources with the digests a
 * launch verifies, the root the sandbox may read and the arguments before the worker's own.
 * @public
 */
export const dotnetClosureSchema = z.object({
  workerExecutable: absolutePath,
  workerSha256: sha256,
  resourceFiles: z.array(z.object({ path: absolutePath, sha256, label: z.string().min(1) })).min(1),
  /**
   * Read-only root the sandbox lets the worker read; the executable and every resource must live inside it. Absent,
   * the executable's directory. A prepared closure passes its root, so the Microsoft `dotnet` muxer and the Tau
   * layer sit side by side under one readable root.
   */
  runtimePath: absolutePath.optional(),
  /**
   * Arguments placed before the worker's own: the absolute path of the framework-dependent worker assembly when
   * `workerExecutable` is the `dotnet` muxer.
   */
  workerArguments: z.array(z.string().min(1)).optional(),
});

/**
 * The options a sealed closure maps to: the closure root and the worker assembly the muxer runs are always present.
 * @public
 */
export const dotnetClosureOptionsSchema = dotnetClosureSchema.required({
  runtimePath: true,
  workerArguments: true,
});

/**
 * The options of a sandboxed native .NET kernel: an optional explicit closure and the host's bounds. A kernel uses it
 * as its `optionsSchema`; with no closure it binds to its sealed closure when it initializes.
 * @public
 */
// Strict, so options in the closure's flat shape fail instead of being dropped and binding to the store.
export const dotnetKernelOptionsSchema = z.strictObject({
  /** An explicit closure (tests, producer trees). Absent, the kernel binds to the sealed closure the resolver finds. */
  closure: dotnetClosureSchema.optional(),
  /** Milliseconds. Zero waits for completion or cancellation. */
  requestTimeout: z.number().int().nonnegative().default(0),
  /** Optional host policy; by default only the representable byte length is bounded. */
  maxArtifactBytes: z.number().int().positive().default(Number.MAX_SAFE_INTEGER),
});

/** An explicit closure a native .NET kernel's options may name. @public */
export type DotnetClosure = z.infer<typeof dotnetClosureSchema>;

/** Parsed options of a native .NET kernel. @public */
export type DotnetKernelOptions = z.infer<typeof dotnetKernelOptionsSchema>;

/** The closure of a native .NET kernel the preparation host sealed. @public */
export type DotnetClosureOptions = DotnetClosure & {
  readonly runtimePath: string;
  readonly workerArguments: readonly string[];
};
