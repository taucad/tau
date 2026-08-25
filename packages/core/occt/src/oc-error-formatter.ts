/**
 * Shared OCCT runtime-error formatter.
 *
 * Wires `parseStackTrace` (with the inline bundle source map and entry URL)
 * and `deriveLocationFromFrames` into {@link formatRuntimeErrorWithOc} so every
 * OCCT-backed kernel produces `KernelIssue` stack frames whose `fileName`
 * resolves back to the user's source path (e.g. `./main.ts`) instead of a raw
 * `blob:.../<uuid>` URL.
 *
 * Kernels supply an `OcErrorContext` with the bundle source map plus an
 * optional `applySecondarySourceMaps` hook (used by the Replicad kernel to
 * demangle frames inside the bundled `replicad` library chunk).
 */

import {
  parseStackTrace,
  createFrameClassifier,
  deriveLocationFromFrames,
  resolveSourcePath,
} from '@taucad/runtime/kernel';
import { formatRuntimeErrorWithOc } from '#oc-exceptions.js';
import type { OcExceptionInstance } from '#oc-exceptions.js';
import type { KernelIssue, KernelStackFrame } from '@taucad/runtime/types';

/**
 * Per-error context required to translate a thrown error into a fully
 * source-mapped {@link KernelIssue}.
 * @public
 */
export type OcErrorContext = {
  /**
   * Inline source-map JSON returned by `EsbuildBundler.bundle` for the user's
   * code. When present, blob/data-URL frames are remapped back to original
   * source positions.
   */
  bundleSourceMap?: string;
  /**
   * The blob/data URL returned by `runtime.execute` for the bundled code. When
   * `parseStackTrace` sees a frame whose `fileName === entryUrl`, it is also
   * treated as a bundled frame eligible for source-map remapping. Defensive —
   * the prefix-matching path covers most cases.
   */
  entryUrl?: string;
  /**
   * Optional secondary frame transformer applied AFTER the bundle source map
   * has rewritten user-source frames. Used by Replicad to map frames inside
   * the bundled `replicad` library chunk back to upstream library sources via
   * the library's own source map.
   */
  applySecondarySourceMaps?: (frames: KernelStackFrame[]) => KernelStackFrame[];
};

const frameClassifier = createFrameClassifier();
const identityFrames = (frames: KernelStackFrame[]): KernelStackFrame[] => frames;

/**
 * Format a runtime error thrown during OCCT-backed kernel execution into a
 * fully source-mapped {@link KernelIssue}.
 *
 * @param error - the thrown value (Error, OcKernelError, WebAssembly.Exception, etc.)
 * @param ocInstance - OC instance used to decode wasm exception payloads
 * @param context - error context with bundle source map and optional library hook
 * @returns a `KernelIssue` whose `stackFrames[*].fileName` and `location.fileName`
 *          point to the user's source paths when a bundle source map is available
 * @public
 */
export function formatOcRuntimeError(
  error: unknown,
  ocInstance: OcExceptionInstance,
  context: OcErrorContext,
): KernelIssue {
  return formatRuntimeErrorWithOc({
    error,
    ocInstance,
    parseStackTrace: (errorToFormat) =>
      parseStackTrace(errorToFormat, {
        classifyFrame: frameClassifier,
        sourceMap: context.bundleSourceMap,
        lastEntryName: context.entryUrl,
        resolveSourcePath,
      }),
    applySourceMaps: context.applySecondarySourceMaps ?? identityFrames,
    deriveLocation: (frames) => deriveLocationFromFrames(frames, context.bundleSourceMap, resolveSourcePath),
    sourceMap: context.bundleSourceMap,
  });
}
