/**
 * Entry of the lean T11 harness: `pnpm nx run runtime:observability-bench`, or after
 * `pnpm nx run runtime:build-observability-bench`:
 *
 * ```sh
 * node node_modules/.cache/runtime-bench/observability-bench.mjs [--mode=quick|full|calibrate] [--samples=60]
 *   [--suite=all|span|facts] [--out=out/reports/benchmarks/runtime-observability]
 * ```
 *
 * It writes `span-path.json` and `operation-facts.json` and exits non-zero when a blocking gate fails.
 * `TAU_SPAN_BENCH_GATE=enforce` makes the span path's relative gate block; `TAU_FACTS_BENCH_GATE=enforce` makes the
 * facts bounds block.
 */

/* oxlint-disable no-restricted-imports -- The harness stays outside the package build graph. */
import { log, parseOptions, writeReport } from './lean-harness.js';
import { runOperationFactsBench } from './operation-facts.lean.js';
import { runSpanPathBench } from './span-path.lean.js';
/* oxlint-enable no-restricted-imports */

const options = parseOptions(process.argv.slice(2), process.env);
let passed = true;
if (options.suites.has('span')) {
  const span = runSpanPathBench(options, process.env['TAU_SPAN_BENCH_GATE'] === 'enforce');
  log(`span-path report: ${writeReport(options.out, 'span-path', span.report)}`);
  passed &&= span.passed;
}
if (options.suites.has('facts')) {
  const facts = runOperationFactsBench(options, process.env['TAU_FACTS_BENCH_GATE'] === 'enforce');
  log(`operation-facts report: ${writeReport(options.out, 'operation-facts', facts.report)}`);
  passed &&= facts.passed;
}
if (!passed) {
  log('observability bench: a blocking gate failed');
  process.exitCode = 1;
}
