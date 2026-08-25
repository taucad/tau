/**
 * Shared OCCT user-code runner.
 *
 * Invokes the user module's `default`/`main` export with the kernel-specific
 * first argument (the OC instance for OpenCascade, the registered `replicad`
 * module for Replicad), and converts any thrown error into a fully
 * source-mapped {@link KernelIssue} via {@link formatOcRuntimeError}.
 *
 * Encapsulates the "runMain with source map" pattern shared by the
 * Replicad and OpenCascade kernels.
 */

import { isRecordObject, named } from '@taucad/runtime/kernel';
import { formatOcRuntimeError } from '#oc-error-formatter.js';
import type { OcErrorContext } from '#oc-error-formatter.js';
import type { OcExceptionInstance } from '#oc-exceptions.js';
import type { KernelIssue } from '@taucad/runtime/types';

const isUserMain = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

/**
 * Result of running the user's `main` function via {@link runOcMain}.
 * @public
 */
export type OcRunMainResult = { success: true; value: unknown } | { success: false; issues: KernelIssue[] };

/**
 * Invoke `module.default` (or `module.main`) with the kernel-specific first
 * argument and the user's parameters. Errors are caught and routed through
 * {@link formatOcRuntimeError} so the resulting issue carries source-mapped
 * stack frames pointing back to the user's code.
 *
 * Returns `{ success: true, value: undefined }` when no `main`/`default`
 * export is present — callers decide whether that is an issue at the
 * application level (e.g. OpenCascade reports a "main not found" warning,
 * Replicad treats it as an empty render).
 * @public
 */
export const runOcMain = named(
  'runOcMain',
  async function (input: {
    module: unknown;
    parameters: Record<string, unknown>;
    ocInstance: OcExceptionInstance;
    errorContext: OcErrorContext;
    /**
     * The first positional argument passed to `main(arg, parameters)` when the
     * user's main has arity >= 2. The OpenCascade kernel passes the OC instance;
     * the Replicad kernel passes the registered `replicad` module.
     */
    firstArg: unknown;
  }): Promise<OcRunMainResult> {
    try {
      const main = isRecordObject(input.module) ? (input.module['default'] ?? input.module['main']) : undefined;
      if (!isUserMain(main)) {
        return { success: true, value: undefined };
      }

      const value = main.length >= 2 ? await main(input.firstArg, input.parameters) : await main(input.parameters);
      return { success: true, value };
    } catch (error) {
      return {
        success: false,
        issues: [formatOcRuntimeError(error, input.ocInstance, input.errorContext)],
      };
    }
  },
);
