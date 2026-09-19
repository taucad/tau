/** Summarise driver raw JSON into markdown tables (medians, min/max, counters, load). Usage: node --import @oxc-node/core/register summarize.mts <raw.json> [...] */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const fmt = (values: number[], digits = 0) =>
  values.length === 0
    ? '—'
    : `${median(values).toFixed(digits)} [${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}] n=${values.length}`;

/**
 * The browser driver records `mode` instead of `arm`, nests its restart phase inside the report instead of emitting a
 * second run, and its page-side counters are `{count,ms,bytes}` with separate `fs.readdir`/`fs.stat` keys. Normalise it
 * into the Node driver's shape so one set of tables serves both legs.
 */
const normaliseBrowser = (raw: any) => {
  const fixSteps = (steps: any[]) =>
    steps.map((step: any) => ({
      ...step,
      loadavg: step.loadavg ?? [0, 0, 0],
      counters: Object.fromEntries([
        ...Object.entries(step.counters ?? {}).map(([key, value]: [string, any]) => [
          key,
          { calls: value.count ?? value.calls ?? 0, ms: value.ms ?? 0, bytes: value.bytes ?? 0 },
        ]),
        /* Only synthesise the combined key when the page side did not already emit it — it does, and clobbering it
         * silently reported 1 scan where the browser had actually made 4,241. */
        ...(step.counters?.['fs.readdirStat']
          ? []
          : ([
              [
                'fs.readdirStat',
                {
                  calls: (step.counters?.['fs.readdir']?.count ?? 0) + (step.counters?.['fs.stat']?.count ?? 0),
                  ms: (step.counters?.['fs.readdir']?.ms ?? 0) + (step.counters?.['fs.stat']?.ms ?? 0),
                  bytes: 0,
                },
              ],
            ] as [string, any][])),
      ]),
    }));
  const runs = raw.runs.flatMap((run: any) =>
    run.ok === false || !run.report
      ? [{ ...run, arm: run.mode }]
      : [
          { ...run, arm: run.mode, phase: 'first', report: { ...run.report, steps: fixSteps(run.report.steps) } },
          ...(run.report.restart
            ? [
                {
                  ...run,
                  arm: run.mode,
                  phase: 'restart',
                  report: { ...run.report, steps: fixSteps(run.report.restart.steps) },
                },
              ]
            : []),
        ],
  );
  return { ...raw, arms: raw.modes, runs };
};

for (const path of process.argv.slice(2)) {
  let raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.modes) raw = normaliseBrowser(raw);
  console.log(`\n### ${raw.model} — ${basename(path)}\n`);
  console.log(
    `steps: ${raw.steps}; restart: ${raw.restartSteps ?? 'none'}; content: ${raw.content}; pairs: ${raw.pairs}`,
  );
  console.log(
    raw.admission
      ? `admission: 1-min load ${raw.admission.loadavg[0].toFixed(2)} at driver start; admitted=${raw.admission.admitted}; override=${raw.admission.override}`
      : 'admission: NOT RECORDED — this raw file predates the driver admission gate, so its load at start is unknown.',
  );
  const usable = (run: any) => run.report && Array.isArray(run.report.steps);
  const loads = raw.runs.filter(usable).flatMap((run: any) => run.report.steps.map((step: any) => step.loadavg[0]));
  console.log(
    `load average (1 min) across steps: median ${median(loads).toFixed(1)}, min ${Math.min(...loads).toFixed(1)}, max ${Math.max(...loads).toFixed(1)}; uptime lines recorded per child.`,
  );
  const failures = raw.runs.filter((run: any) => !run.ok);
  if (failures.length)
    console.log(
      `FAILED children (completed steps kept): ${failures.map((run: any) => `${run.arm}#${run.pair}/${run.phase} status=${run.status} steps=${run.report?.steps?.length ?? 0}${run.report?.error ? ' ' + run.report.error.slice(0, 60) : ''}`).join(', ')}`,
    );
  const rows: Record<string, Record<string, any[]>> = {};
  const retried: string[] = [];
  for (const run of raw.runs) {
    if (!usable(run)) continue;
    for (const step of run.report.steps) {
      if (step.retried) {
        retried.push(`${run.arm}#${run.pair}/${run.phase}/${step.step}`);
        continue;
      } // superseded-and-retried steps are contaminated by the superseded render still running in the worker
      const key = `${run.arm} ${run.phase === 'restart' ? 'restart:' : ''}${step.step}`;
      const bucket = (rows[key] ??= {
        wall: [],
        main: [],
        sessionOpen: [],
        flush: [],
        mesh: [],
        hits: [],
        cacheHits: [],
        lookups: [],
        records: [],
        readdirStat: [],
        writes: [],
        writeBytes: [],
        serialize: [],
        restore: [],
        triangles: [],
        sha: [],
        brep: [],
        interfaces: [],
      });
      bucket.wall.push(step.wallMs);
      bucket.main.push(
        step.spans['create.runOcMain']?.ms ??
          step.spans['openrscad.export-3d']?.ms ??
          step.spans['kernel.compute']?.ms ??
          0,
      );
      bucket.sessionOpen.push(step.counters['session.open']?.ms ?? 0);
      bucket.flush.push(step.counters['session.flush']?.ms ?? 0);
      bucket.mesh.push(step.spans['kernel.mesh']?.ms ?? 0);
      bucket.hits.push(step.lookups.hit);
      bucket.cacheHits.push(step.lookups.cache);
      bucket.lookups.push(step.lookups.hit + step.lookups.miss);
      bucket.records.push(step.records.staged);
      bucket.interfaces.push(step.spans['create.resolveInterfaces']?.ms ?? 0);
      if (step.brep) bucket.brep.push(step.brep.sha256.slice(0, 8));
      bucket.readdirStat.push(step.counters['fs.readdirStat']?.calls ?? 0);
      bucket.writes.push(step.counters['fs.writeFile']?.calls ?? 0);
      bucket.writeBytes.push(step.counters['fs.writeFile']?.bytes ?? 0);
      bucket.serialize.push(step.counters['brep.serialize']?.ms ?? 0);
      bucket.restore.push(step.counters['brep.restore']?.ms ?? 0);
      bucket.triangles.push(step.output.triangles);
      bucket.sha.push(step.output.sha256.slice(0, 8));
    }
  }
  if (retried.length) console.log(`retried (excluded) steps: ${retried.join(', ')}`);
  console.log(
    '\n| arm / step | wall ms | main ms | interfaces ms | session open ms | flush ms | mesh ms | hits(cache)/lookups | records | readdirStat | writes (bytes) | serialize ms | restore ms | triangles | brep8 |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const [key, b] of Object.entries(rows)) {
    console.log(
      `| ${key} | ${fmt(b.wall)} | ${fmt(b.main)} | ${fmt(b.interfaces)} | ${fmt(b.sessionOpen, 1)} | ${fmt(b.flush)} | ${fmt(b.mesh)} | ${median(b.hits)}(${median(b.cacheHits)})/${median(b.lookups)} | ${median(b.records)} | ${fmt(b.readdirStat)} | ${median(b.writes)} (${median(b.writeBytes)}) | ${fmt(b.serialize, 1)} | ${fmt(b.restore, 1)} | ${[...new Set(b.triangles)].sort().slice(0, 3).join('/')}${new Set(b.triangles).size > 3 ? '…' : ''} | ${b.brep.length ? [...new Set(b.brep)].join('/') : '—'} |`,
    );
  }
  // Paired ratios: for each pair, arm X step S wall / bypass step S wall.
  const byPair: Record<string, Record<string, number>> = {};
  for (const run of raw.runs) {
    if (!usable(run)) continue;
    for (const step of run.report.steps)
      if (!step.retried) (byPair[`${run.pair}:${run.phase}:${step.step}`] ??= {})[run.arm] = step.wallMs;
  }
  const ratios: Record<string, number[]> = {};
  for (const [key, arms] of Object.entries(byPair)) {
    const bypass = arms['bypass'] ?? arms['disabled'];
    if (bypass === undefined) continue;
    for (const [arm, wall] of Object.entries(arms))
      if (arm !== 'bypass' && arm !== 'disabled')
        (ratios[`${arm} / off @ ${key.split(':').slice(1).join(' ')}`] ??= []).push(wall / bypass);
  }
  if (Object.keys(ratios).length) {
    console.log('\n| paired wall ratio | median [min–max] |');
    console.log('|---|---:|');
    for (const [key, values] of Object.entries(ratios)) console.log(`| ${key} | ${fmt(values, 2)} |`);
  }
}
