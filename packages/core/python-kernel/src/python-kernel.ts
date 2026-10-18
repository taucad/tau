import { isAbsolute } from 'node:path';

import { z } from 'zod';

/**
 * The `tau_kernel` modules every Python kernel's closure carries beside its own worker, relative to the worker
 * directory. A kernel package pins its generated copy of each as a raw payload of its `tau-plugin.json`.
 * @public
 */
export const pythonKernelModules = [
  'tau_kernel/analyzer.py',
  'tau_kernel/glb.py',
  'tau_kernel/model.py',
  'tau_kernel/protocol.py',
] as const;

/**
 * What identifies one Python kernel's worker to the shared session, closure, seal and mirror helpers.
 * @public
 */
export type PythonKernelWorker = {
  /** The kernel id, such as `build123d`: it names the private temporary roots and `tau prepare <id>`. */
  readonly kernelId: string;
  /** The display name, such as `Build123d`, in session names, sandbox command ids and messages. */
  readonly kernelName: string;
  /**
   * The worker entry, then the kernel's own support modules, as paths relative to the closure's `tau-worker/`
   * directory. The `tau_kernel` modules follow them implicitly.
   */
  readonly workerModules: readonly [string, ...string[]];
};

/**
 * The support modules a worker's launch hashes besides its entry: the kernel's own, then `tau_kernel`'s.
 * @param worker - The kernel's worker.
 * @returns Paths relative to the worker directory.
 * @public
 */
export const pythonSupportModules = (worker: Pick<PythonKernelWorker, 'workerModules'>): readonly string[] => [
  ...worker.workerModules.slice(1),
  ...pythonKernelModules,
];

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/i, 'Expected a SHA-256 digest');

const endsWithModule = (path: string, module: string): boolean => path.replaceAll('\\', '/').endsWith(`/${module}`);

/**
 * The options schema of a worker whose launch verifies `required` support modules.
 * @param required - Every support module, relative to the worker directory.
 * @returns The schema.
 */
const optionsSchemaOf = (required: readonly string[]) =>
  z.object({
    pythonExecutable: absolutePath,
    workerPath: absolutePath,
    pythonSha256: sha256,
    workerSha256: sha256,
    supportFiles: z
      .array(z.object({ path: absolutePath, sha256 }))
      .length(required.length)
      .superRefine((files, context) => {
        if (required.some((module) => !files.some(({ path }) => endsWithModule(path, module)))) {
          context.addIssue({ code: 'custom', message: `Support files must contain ${required.join(', ')}` });
        }
      }),
    /**
     * The closure root the sandbox may read, when the interpreter and the worker scripts share one (a closure the
     * preparation host sealed). Absent, it is the interpreter's prefix, which must then hold the worker too.
     */
    runtimePath: absolutePath.optional(),
    /** Milliseconds. Zero waits for completion or cancellation. */
    requestTimeout: z.number().int().nonnegative().default(0),
    /** Optional host policy; by default only the representable byte length is bounded. */
    maxArtifactBytes: z.number().int().positive().default(Number.MAX_SAFE_INTEGER),
  });

/**
 * The options every Python kernel takes: the interpreter, the worker and its support modules with the digests a
 * launch verifies, the root the sandbox may read and the host's bounds.
 *
 * @param options - The kernel's own support modules (not the entry), relative to the worker directory; the
 *   `tau_kernel` modules are required too.
 * @returns The kernel's options schema.
 * @public
 * @example <caption>A kernel whose worker has no support modules of its own</caption>
 * ```typescript
 * import { pythonKernelOptionsSchema } from '@taucad/python-kernel-core';
 * export const smlibpyOptionsSchema = pythonKernelOptionsSchema({ supportModules: [] });
 * ```
 */
export const pythonKernelOptionsSchema = (options: {
  readonly supportModules: readonly string[];
}): ReturnType<typeof optionsSchemaOf> => optionsSchemaOf([...options.supportModules, ...pythonKernelModules]);

/**
 * The options a Python kernel's schema accepts.
 * @public
 */
export type PythonKernelOptions = z.input<ReturnType<typeof pythonKernelOptionsSchema>>;
