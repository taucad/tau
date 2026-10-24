/**
 * Per-instrument series caps for the API's metrics pipeline.
 *
 * `@opentelemetry/sdk-metrics` keeps at most `aggregationCardinalityLimit` attribute sets per instrument and folds
 * every further set into one series labelled `otel.metric.overflow="true"`. Without a view that limit is 2,000.
 *
 * Each view here names exactly one runtime-observation instrument whose realistic live series set exceeds that
 * default, and sets its limit to about twice that set. A view never uses a wildcard name: a wildcard would select
 * every matching instrument and give each one a second stream. Every instrument without a view, including all of
 * today's `kernel.*`, `agent.*`, `sync.*` and `http.*` instruments, keeps the 2,000 default.
 *
 * The release-labelled instruments stay bounded because the release label is limited at record time to the newest
 * admitted releases; `tau.runtime.operation.cohort_duration` multiplies that bound by kernel and operation, so it is
 * named here.
 */
import type { metrics } from '@opentelemetry/sdk-node';

/** Series cap that sdk-metrics applies to an instrument no view selects. */
export const defaultCardinalityLimit = 2000;

/** Named views passed to `NodeSDK`; one instrument per view, never a wildcard. */
export const cardinalityViews: readonly metrics.ViewOptions[] = [
  // Settled attempts by operation, outcome, cause, kernel and population: ≈ 3,800 live series.
  { instrumentName: 'tau.runtime.operations', aggregationCardinalityLimit: 8192 },
  // Attempt duration by operation, outcome, route and cold start: ≈ 700 live series × 16 buckets.
  { instrumentName: 'tau.runtime.operation.duration', aggregationCardinalityLimit: 4096 },
  // Non-success attempts by error type, operation and kernel; a flood of unknown codes lands in overflow.
  { instrumentName: 'tau.runtime.operation_errors', aggregationCardinalityLimit: 4096 },
  // Kernel heap by kernel, source, failure, route, device and population: up to 2,304 sets.
  { instrumentName: 'tau.runtime.kernel.heap', aggregationCardinalityLimit: 4096 },
  // Exports by kernel, format, outcome and population.
  { instrumentName: 'tau.runtime.exports', aggregationCardinalityLimit: 4096 },
  // Succeeded attempts by operation, kernel and admitted release: ≈ 6,300 worst case, ≈ 1,500 typical.
  { instrumentName: 'tau.runtime.operation.cohort_duration', aggregationCardinalityLimit: 8192 },
  // Non-kernel plugin uses: ≈ 540 live series. The cap bounds memory rather than forged traffic, which overflows.
  { instrumentName: 'tau.runtime.plugin_operations', aggregationCardinalityLimit: 2048 },
];
