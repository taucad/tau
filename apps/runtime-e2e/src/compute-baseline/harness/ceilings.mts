/**
 * Where-the-time-goes + theoretical reuse ceilings from identity-traced runs (`run-arm --trace identity|shapes`).
 * Usage: node --import @oxc-node/core/register spikes/compute-reuse/lane-b/ceilings.mts <run-arm-out.json | driver-raw.json> [...]
 * For each run: per-op census (calls, ms, share, identifiable share, failed), non-main render phases, and for every
 * non-cold step the ceilings vs the cold trace: perfect structural cache (any identifiable op whose identity also
 * appears in cold), program-order prefix only, and what the current Replicad allow-list could reach.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ceilings, type TraceEntry } from './identity-tracer.mts';

const pct = (part: number, total: number) => (total > 0 ? `${((100 * part) / total).toFixed(1)}%` : '—');
const ms = (value: number) => value.toFixed(0);

const analyseRun = (report: any, label: string) => {
  const steps: any[] = report.steps.filter((step: any) => Array.isArray(step.trace));
  if (steps.length === 0) return;
  console.log(`\n## ${report.model} (${report.arm}, ${label}) — node ${report.node}, wasm ${report.wasm ?? 'n/a'}`);
  for (const step of steps) {
    const trace: TraceEntry[] = step.trace;
    const total = trace.reduce((sum, entry) => sum + entry.ms, 0);
    const idTotal = trace.reduce((sum, entry) => sum + (entry.idMs ?? 0), 0);
    const unidentifiable = trace.filter((entry) => !entry.identifiable).reduce((sum, entry) => sum + entry.ms, 0);
    const failed = trace.filter((entry) => entry.failed);
    const main = step.spans['create.runOcMain']?.ms ?? 0;
    const phases = [
      'create.resolveInterfaces',
      'create.serializeNativeHandle',
      'kernel.mesh',
      'kernel.bundle',
      'kernel.select',
      'session.open',
    ]
      .map(
        (name) =>
          `${name.replace('create.', '').replace('kernel.', '')}=${ms(step.spans[name]?.ms ?? step.counters?.[name]?.ms ?? 0)}`,
      )
      .join(' ');
    console.log(
      `\n### step ${step.step} ${JSON.stringify(step.parameters)} — wall ${ms(step.wallMs)} ms, main ${ms(main)} ms, traced ops ${trace.length} = ${ms(total)} ms (${pct(total, main)} of main); identity overhead ${idTotal.toFixed(1)} ms (${pct(idTotal, total)} of traced); unidentifiable ${ms(unidentifiable)} ms (${pct(unidentifiable, total)}); failed calls ${failed.length} = ${ms(failed.reduce((s, e) => s + e.ms, 0))} ms; load ${step.loadavg[0].toFixed(1)}; phases: ${phases}`,
    );
    const perOp: Record<string, { calls: number; ms: number; idMs: number; unident: number; failed: number }> = {};
    for (const entry of trace) {
      const record = (perOp[entry.op] ??= { calls: 0, ms: 0, idMs: 0, unident: 0, failed: 0 });
      record.calls += 1;
      record.ms += entry.ms;
      record.idMs += entry.idMs ?? 0;
      if (!entry.identifiable) record.unident += 1;
      if (entry.failed) record.failed += 1;
    }
    console.log('\n| op | calls | ms | share of traced | identity ms | unidentifiable calls | failed |');
    console.log('|---|---:|---:|---:|---:|---:|---:|');
    for (const [op, record] of Object.entries(perOp)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 14))
      console.log(
        `| ${op} | ${record.calls} | ${ms(record.ms)} | ${pct(record.ms, total)} | ${record.idMs.toFixed(2)} | ${record.unident} | ${record.failed} |`,
      );
  }
  const cold = steps.find((step) => step.step === 'cold');
  if (!cold) return;
  console.log(
    '\n| edited step | traced ms | perfect-cache reusable ms (calls) | prefix-only reusable ms (calls) | allow-list reachable ms (calls) | ceiling ×(traced) | prefix ×(traced) | allow-list ×(traced) | whole-render ceiling × |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const step of steps) {
    if (step === cold) continue;
    const report = ceilings(cold.trace, step.trace);
    const wall = step.wallMs;
    const wholeCeiling = wall / Math.max(1, wall - report.sharedMs);
    console.log(
      `| ${step.step} | ${ms(report.totalMs)} | ${ms(report.sharedMs)} (${report.sharedCount}/${report.opCount}) | ${ms(report.prefixMs)} (${report.prefixCount}) | ${ms(report.allowListSharedMs)} (${report.allowListSharedCount}) | ${report.ceilingSpeedup.toFixed(2)} | ${report.prefixCeilingSpeedup.toFixed(2)} | ${report.allowListCeilingSpeedup.toFixed(2)} | ${wholeCeiling.toFixed(2)} |`,
    );
  }
  // Shape codec measurements (--trace shapes): serialize/restore/clone vs faces.
  const shaped = steps.flatMap((step) =>
    step.trace
      .filter((entry: any) => entry.shape && entry.shape.faces !== undefined)
      .map((entry: any) => ({ step: step.step, op: entry.op, opMs: entry.ms, ...entry.shape })),
  );
  if (shaped.length) {
    const buckets = [
      [0, 10],
      [10, 50],
      [50, 200],
      [200, 1000],
      [1000, Infinity],
    ];
    console.log(
      `\n| faces bucket | shapes | median faces | median bytes | serialize ms med [min–max] | restore ms med | clone µs med | faces+edges listing ms med | hashCode µs med | op ms med |`,
    );
    console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    const med = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
    };
    for (const [lo, hi] of buckets) {
      const group = shaped.filter((entry: any) => entry.faces >= lo && entry.faces < hi);
      if (!group.length) continue;
      const ser = group.map((e: any) => e.serializeMs);
      console.log(
        `| ${lo}–${hi === Infinity ? '∞' : hi} | ${group.length} | ${med(group.map((e: any) => e.faces))} | ${med(group.map((e: any) => e.bytes))} | ${med(ser).toFixed(2)} [${Math.min(...ser).toFixed(2)}–${Math.max(...ser).toFixed(2)}] | ${med(group.map((e: any) => e.restoreMs)).toFixed(2)} | ${(1000 * med(group.map((e: any) => e.cloneMs))).toFixed(1)} | ${med(group.map((e: any) => e.listMs)).toFixed(2)} | ${(1000 * med(group.map((e: any) => e.hashCodeMs))).toFixed(1)} | ${med(group.map((e: any) => e.opMs)).toFixed(2)} |`,
      );
    }
  }
};

for (const path of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(raw.runs)) {
    for (const run of raw.runs)
      if (run.ok) analyseRun(run.report, `${basename(path)} ${run.arm} pair${run.pair} ${run.phase}`);
  } else analyseRun(raw, basename(path));
}
