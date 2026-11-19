/**
 * Summarize a `qualify-driver.mts` campaign: byte parity against `off` (I1), the history-independence gate,
 * deterministic counts, and timings as median [min–max] (n) per model, arm and step kind.
 *
 * Usage (repository root):
 *   node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-summarize.mts \
 *     <campaign dir> [--pins apps/runtime-e2e/src/compute-baseline/qualification-baselines.json] [--writePins <file>] [--json <file>]
 *
 * --pins       compare `off` hashes and every arm's counts against the pinned baselines and report drift
 * --writePins  write the campaign's `off` hashes and per-arm counts as a pins file. Only for a deliberate
 *              baseline change: a pin is never regenerated to turn a failing gate green.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { pins: { type: 'string' }, writePins: { type: 'string' }, json: { type: 'string' } },
});
const dir = positionals[0];
if (!dir) throw new Error('usage: qualify-summarize.mts <campaign dir>');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const reports = index.runs
  .filter((run: any) => run.ok)
  .map((run: any) => ({ ...run, report: JSON.parse(readFileSync(join(dir, run.file), 'utf8')) }));
const failedRuns = index.runs.filter((run: any) => !run.ok);

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const stat = (xs: number[]) =>
  xs.length === 0
    ? '—'
    : `${Math.round(median(xs))} [${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))}] (${xs.length})`;
const span = (step: any, name: string) => step.spans?.[name]?.ms ?? 0;

/** Step kind of a matrix step from its position: the first base is cold, a later base is a revisit. */
const matrixKind = (step: any) => {
  if (step.index === 0) return 'cold';
  if (step.token === 'A' || step.token === 'B') return 'edit';
  if (step.token === 'base' || step.token === 'original') return 'revisit';
  return step.token; // comment, literal
};

const models: string[] = [...new Set<string>(reports.map((run: any) => run.model))];
const arms: string[] = [...new Set<string>(reports.map((run: any) => run.arm))];
const of = (model: string, scenario: string, arm: string) =>
  reports.filter((run: any) => run.model === model && run.scenario === scenario && run.arm === arm);

const lines: string[] = [];
const out = (line = '') => lines.push(line);
const summary: any = { dir, host: index.host, failedRuns, parity: {}, history: {}, counts: {}, timings: {} };
let parityFailures = 0;
let historyFailures = 0;

out(`# Compute reuse qualification — ${index.stamp}`);
out();
out(
  `Host: ${index.host.cpu} × ${index.host.cpus}, Node ${index.host.node}; load at start ${index.host.loadavgAtStart?.map((v: number) => v.toFixed(1)).join(' ')}, at end ${index.host.loadavgAtEnd?.map((v: number) => v.toFixed(1)).join(' ') ?? '—'}. Runs: ${index.runs.length}, failed: ${failedRuns.length}.`,
);
for (const run of failedRuns)
  out(`- FAILED: ${run.model} ${run.scenario} ${run.arm} p${run.pair} (status ${run.status})`);
out();

// ---- byte parity (I1): every arm's matrix and scrub outputs against off, and off against itself across pairs
out('## Byte parity against reuse off (I1)');
out();
out('One character per matrix step (`=` equal to off, `D` different); off is also checked across pairs.');
out();
out('| model | arm | pairs | steps | parity |');
out('| --- | --- | --- | --- | --- |');
const offHash: Record<string, Record<string, string>> = {};
for (const model of models) {
  const offRuns = of(model, 'matrix', 'off');
  const reference = offRuns[0]?.report.steps ?? [];
  offHash[model] = {};
  for (const step of reference) offHash[model][step.geometry] ??= step.output.sha256;
  for (const arm of arms) {
    for (const run of of(model, 'matrix', arm)) {
      const marks = run.report.steps
        .map((step: any) => (offHash[model]![step.geometry] === step.output.sha256 ? '=' : 'D'))
        .join('');
      if (marks.includes('D')) parityFailures += 1;
      (summary.parity[model] ??= {})[`${arm}.p${run.pair}`] = marks;
      out(
        `| ${model} | ${arm} | p${run.pair} | ${run.report.steps.map((step: any) => step.token).join(',')} | ${marks} |`,
      );
    }
  }
}
out();

// ---- history independence gate
out('## History-independence gate');
out();
out(
  'Each history is a new client that wanders through a random prefix (seeded) and then renders every target in random order; a target passes when its GLB hash equals off for the same geometry. Durable histories share one store, so later histories start from what earlier ones stored.',
);
out();
out('| model | arm | histories | targets | mismatches | distinct hashes per geometry |');
out('| --- | --- | --- | --- | --- | --- |');
for (const model of models) {
  for (const arm of arms) {
    for (const run of of(model, 'history', arm)) {
      const targets = run.report.steps.filter((step: any) => step.phase === 'target');
      const all = run.report.steps.filter((step: any) => step.output?.sha256);
      const mismatches = all.filter(
        (step: any) =>
          offHash[model]?.[step.geometry] !== undefined && offHash[model]![step.geometry] !== step.output.sha256,
      );
      const distinct: Record<string, Set<string>> = {};
      for (const step of all) (distinct[step.geometry] ??= new Set()).add(step.output.sha256);
      const histories = new Set(run.report.steps.map((step: any) => step.history)).size;
      if (mismatches.length > 0) historyFailures += 1;
      summary.history[`${model}.${arm}`] = {
        histories,
        targets: targets.length,
        rendered: all.length,
        mismatches: mismatches.map((step: any) => `h${step.history}:${step.phase}:${step.token}`),
      };
      out(
        `| ${model} | ${arm} | ${histories} | ${targets.length} (+${all.length - targets.length} prefix) | ${
          mismatches.length === 0
            ? '0'
            : `${mismatches.length}: ${mismatches
                .slice(0, 6)
                .map((step: any) => `h${step.history} ${step.phase} ${step.token}`)
                .join(', ')}`
        } | ${Object.entries(distinct)
          .map(([key, set]) => `${key} ${set.size}`)
          .join(', ')} |`,
      );
    }
  }
}
out();

// ---- stop latency (abort scenario, worker transport)
const abortRows = models.flatMap((model) =>
  arms.flatMap((arm) => of(model, 'abort', arm).map((run: any) => ({ model, arm, run }))),
);
if (abortRows.length > 0) {
  out('## Stop latency of a superseded build');
  out();
  out(
    'A running build is superseded by the next edit (worker transport). `stop after issue` is how long its `main()` kept running after the supersede was issued: the wait for the next OCCT call boundary plus the abort poll. Odd trials supersede `main()` as it starts and are valid when it was still running at the supersede; even trials supersede the render as its GLB pack starts and are valid when it was still running. The 50 ms target is measured from the next operation boundary, which this number upper-bounds; it is reported, not gated. `next build after issue` runs from the supersede to the start of the committed edit build `main()`, over both kinds; `renders cancelled` counts the pack trials whose render stopped.',
  );
  out();
  out(
    '| model | arm | valid trials | stop after issue ms | next build after issue ms | renders cancelled | superseded main ms | committed bytes = off |',
  );
  out('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const grouped: Record<string, any[]> = {};
  for (const row of abortRows) (grouped[`${row.model}|${row.arm}`] ??= []).push(row.run);
  for (const [key, runs] of Object.entries(grouped)) {
    const [model, arm] = key.split('|') as [string, string];
    const trials = runs.flatMap((run: any) => run.report.steps.filter((step: any) => step.phase === 'supersede'));
    const valid = trials.filter((step: any) => step.abort?.valid);
    const offTrials = of(model, 'abort', 'off').flatMap((run: any) =>
      run.report.steps.filter((step: any) => step.phase === 'supersede'),
    );
    const offByToken = new Map(offTrials.map((step: any) => [step.token, step.output?.sha256]));
    const equal = trials.every((step: any) => offByToken.get(step.token) === step.output?.sha256);
    const validMain = valid.filter((step: any) => step.abort.target !== 'pack');
    const pack = valid.filter((step: any) => step.abort.target === 'pack');
    const cancelled = pack.filter((step: any) => step.abort.supersededRender === 'cancelled').length;
    (summary.stopLatency ??= {})[key] = validMain.map((step: any) => step.abort.stopAfterIssueMs);
    out(
      `| ${model} | ${arm} | ${valid.length}/${trials.length} | ${stat(validMain.map((step: any) => step.abort.stopAfterIssueMs))} | ${stat(valid.map((step: any) => step.abort.nextBuildAfterIssue))} | ${cancelled}/${pack.length} | ${stat(validMain.map((step: any) => step.abort.supersededMainMs))} | ${equal ? 'yes' : 'NO'} |`,
    );
  }
  out();
}

// ---- deterministic counts
out('## Counts (deterministic; asserted in CI)');
out();
out(
  'Per step as `modelRuns/tessellations/storeWrites`. Agent: the nine fresh-lifecycle calls, then the total. Scrub: open, back-to-back scrub, revisit, rested transient frame.',
);
out();
out('| model | scenario | arm | per step | total |');
out('| --- | --- | --- | --- | --- |');
const countsKey = (counts: any) => `${counts.modelRuns}/${counts.tessellations}/${counts.storeWrites}`;
for (const model of models) {
  for (const scenario of ['matrix', 'scrub', 'agent']) {
    for (const arm of arms) {
      const runs = of(model, scenario, arm);
      if (runs.length === 0) continue;
      const perPair = runs.map((run: any) => run.report.steps.map((step: any) => countsKey(step.counts)).join(' '));
      const stable = new Set(perPair).size === 1;
      const steps = runs[0].report.steps;
      const total = steps.reduce(
        (sum: any, step: any) => ({
          modelRuns: sum.modelRuns + step.counts.modelRuns,
          tessellations: sum.tessellations + step.counts.tessellations,
          storeWrites: sum.storeWrites + step.counts.storeWrites,
        }),
        { modelRuns: 0, tessellations: 0, storeWrites: 0 },
      );
      ((summary.counts[model] ??= {})[scenario] ??= {})[arm] = {
        steps: steps.map((step: any) => step.counts),
        stableAcrossPairs: stable,
      };
      out(
        `| ${model} | ${scenario} | ${arm} | ${perPair[0]}${stable ? '' : ` (UNSTABLE: ${perPair.slice(1).join(' | ')})`} | ${countsKey(total)} |`,
      );
    }
  }
}
out();

// ---- timings
out('## Timings (data, not gates)');
out();
out(
  "Wall ms per step kind as median [min–max] (n), over every step of that kind in every pair; `main` is the model's own `main()` (`replicad.run-main`). Cold includes kernel start.",
);
out();
out(
  '| model | arm | cold wall | edit wall | edit main | revisit wall | comment wall | literal wall | scrub wall | rested transient | agent 9 calls |',
);
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const model of models) {
  for (const arm of arms) {
    const matrixSteps = of(model, 'matrix', arm).flatMap((run: any) => run.report.steps);
    if (matrixSteps.length === 0) continue;
    const kind = (name: string) => matrixSteps.filter((step: any) => matrixKind(step) === name);
    const scrubSteps = of(model, 'scrub', arm).flatMap((run: any) => run.report.steps);
    const agentTotals = of(model, 'agent', arm).map((run: any) =>
      run.report.steps.reduce((sum: number, step: any) => sum + step.wallMs, 0),
    );
    const row = {
      cold: kind('cold').map((step: any) => step.wallMs),
      edit: kind('edit').map((step: any) => step.wallMs),
      editMain: kind('edit').map((step: any) => span(step, 'replicad.run-main')),
      revisit: kind('revisit').map((step: any) => step.wallMs),
      comment: kind('comment').map((step: any) => step.wallMs),
      literal: kind('literal').map((step: any) => step.wallMs),
      scrub: scrubSteps.filter((step: any) => step.phase === 'scrub').map((step: any) => step.wallMs),
      rested: scrubSteps.filter((step: any) => step.phase === 'rested-transient').map((step: any) => step.wallMs),
      agent: agentTotals,
    };
    (summary.timings[model] ??= {})[arm] = Object.fromEntries(
      Object.entries(row).map(([key, xs]) => [
        key,
        xs.length ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs), n: xs.length } : null,
      ]),
    );
    out(
      `| ${model} | ${arm} | ${stat(row.cold)} | ${stat(row.edit)} | ${stat(row.editMain)} | ${stat(row.revisit)} | ${stat(row.comment)} | ${stat(row.literal)} | ${stat(row.scrub)} | ${stat(row.rested)} | ${stat(row.agent)} |`,
    );
  }
}
out();
const loads = reports
  .flatMap((run: any) => run.report.steps.map((step: any) => step.load))
  .filter((value: unknown) => typeof value === 'number');
if (loads.length)
  out(
    `Load average (1 min) across measured steps: median ${median(loads).toFixed(1)}, min ${Math.min(...loads).toFixed(1)}, max ${Math.max(...loads).toFixed(1)}.`,
  );

// ---- pins
const pinsOf = () => {
  const pins: any = { campaign: index.stamp, host: index.host.cpu, models: {} };
  for (const model of models) {
    const offRun = of(model, 'matrix', 'off')[0];
    const scrubOff = of(model, 'scrub', 'off')[0];
    pins.models[model] = {
      off: {
        matrix: offRun?.report.steps.map((step: any) => ({
          token: step.token,
          sha256: step.output.sha256,
          triangles: step.output.triangles,
        })),
        scrub: scrubOff?.report.steps.map((step: any) => ({ phase: step.phase, sha256: step.output.sha256 })),
      },
      counts: Object.fromEntries(
        arms.map((arm) => [
          arm,
          Object.fromEntries(
            ['matrix', 'scrub', 'agent'].map((scenario) => [
              scenario,
              of(model, scenario, arm)[0]?.report.steps.map((step: any) => step.counts),
            ]),
          ),
        ]),
      ),
    };
  }
  return pins;
};
if (values.pins) {
  const pinned = JSON.parse(readFileSync(values.pins, 'utf8'));
  const current = pinsOf();
  out();
  out('## Drift against pinned baselines');
  out();
  const drift: string[] = [];
  for (const model of models) {
    const want = pinned.models?.[model];
    const have = current.models[model];
    if (!want) {
      drift.push(`${model}: not pinned`);
      continue;
    }
    if (
      JSON.stringify(want.off.matrix?.map((step: any) => step.sha256)) !==
      JSON.stringify(have.off.matrix?.map((step: any) => step.sha256))
    )
      drift.push(`${model}: off matrix hashes differ from the pins`);
    for (const arm of arms)
      for (const scenario of ['matrix', 'scrub', 'agent'])
        if (
          have.counts[arm]?.[scenario] &&
          want.counts?.[arm]?.[scenario] &&
          JSON.stringify(have.counts[arm][scenario]) !== JSON.stringify(want.counts[arm][scenario])
        )
          drift.push(`${model}: ${arm} ${scenario} counts differ from the pins`);
  }
  for (const line of drift.length ? drift : ['none']) out(`- ${line}`);
  summary.drift = drift;
}
if (values.writePins) writeFileSync(values.writePins, `${JSON.stringify(pinsOf(), null, 1)}\n`);
summary.parityFailures = parityFailures;
summary.historyFailures = historyFailures;
if (values.json) writeFileSync(values.json, JSON.stringify(summary, null, 1));
console.log(lines.join('\n'));
