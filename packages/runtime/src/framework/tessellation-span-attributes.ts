import type { TessellationReport } from '#types/runtime-kernel-v2.types.js';
import type { KernelIssue } from '#types/runtime.types.js';

/** Span attribute values the runtime tracer accepts. */
type SpanAttributes = Record<string, string | number | boolean>;

/** Prefix of the effective-tessellation attributes on a `kernel.mesh` span. */
const prefix = 'tessellation.effective';

/**
 * Flatten a render's tessellation report into `tessellation.effective.*` span attributes.
 *
 * The form is `preset` (with the preset name) or `explicit`; tolerances are the effective ones, after any
 * downgrade. `downgraded` reads the report's step count and `simplified` the delivered `DISPLAY_SIMPLIFIED`
 * issue, so the next audit can read the distribution of effective resolutions from traces alone.
 *
 * @param report - The delivered artifact's tessellation report, if the kernel produced one.
 * @param issues - The render's delivered issues.
 * @returns The attributes, or an empty object when the render carries no report.
 * @internal
 */
export const tessellationSpanAttributes = (
  report: TessellationReport | undefined,
  issues: readonly KernelIssue[],
): SpanAttributes => {
  if (!report) {
    return {};
  }
  const attributes: SpanAttributes = {
    [`${prefix}.triangles`]: report.triangles,
    [`${prefix}.vertices`]: report.vertices,
    [`${prefix}.elapsed`]: report.elapsed,
    [`${prefix}.downgraded`]: (report.downgraded ?? 0) > 0,
    [`${prefix}.simplified`]: issues.some((issue) => issue.code === 'DISPLAY_SIMPLIFIED'),
  };
  if (report.requested !== undefined) {
    attributes[`${prefix}.form`] = report.requested === 'explicit' ? 'explicit' : 'preset';
    if (report.requested !== 'explicit') {
      attributes[`${prefix}.preset`] = report.requested;
    }
  }
  if (report.linearTolerance !== undefined) {
    attributes[`${prefix}.linearTolerance`] = report.linearTolerance;
  }
  if (report.angularTolerance !== undefined) {
    attributes[`${prefix}.angularTolerance`] = report.angularTolerance;
  }
  if (report.downgraded !== undefined) {
    attributes[`${prefix}.downgradeSteps`] = report.downgraded;
  }
  if (report.voxelSize !== undefined) {
    attributes[`${prefix}.voxelSize`] = report.voxelSize;
  }
  return attributes;
};
