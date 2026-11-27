/**
 * Admission of a kernel's build report (`EvaluateOutput.build`) and the evaluation's report built from it.
 *
 * A kernel's report is untrusted plugin output that crosses the worker boundary: it is kept only when it is well
 * formed, with its costliest operations bounded to the first three, so a malformed report never fails the
 * evaluation it describes.
 */
import { kernelBuildReportSchema } from '#types/runtime-document-protocol.schemas.js';
import type { BuildReport, KernelBuildReport } from '#types/runtime-kernel-v2.types.js';

/**
 * Keep a kernel's build report when it is well formed.
 * @param value - What the kernel's `evaluate` returned as `build`.
 * @returns The admitted report, or `undefined`.
 * @internal
 */
export const admitKernelBuildReport = (value: unknown): KernelBuildReport | undefined => {
  // Reading the report runs plugin code (a getter, a proxy trap): any throw drops the report, not the evaluation.
  try {
    const costliest: unknown = (value as { costliest?: unknown } | undefined)?.costliest;
    const parsed = kernelBuildReportSchema.safeParse(
      Array.isArray(costliest)
        ? { ...(value as Readonly<Record<string, unknown>>), costliest: costliest.slice(0, 3) }
        : value,
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The build report of a successful evaluation.
 * @param built - The kernel's `evaluate` ran for this evaluation; otherwise the retained build or a stored one answered.
 * @param kernel - The admitted report of that run.
 * @param elapsed - Milliseconds the worker spent producing the evaluation, reported to a tenth of a millisecond.
 * @returns The report: reused when no build ran or the kernel answered from a build it kept.
 * @internal
 */
export const buildReportOf = (built: boolean, kernel: KernelBuildReport | undefined, elapsed: number): BuildReport => {
  const tenths = Math.round(elapsed * 10) / 10;
  return !built || kernel?.reused === true
    ? { reused: true, elapsed: tenths }
    : { ...kernel, reused: false, elapsed: tenths };
};
