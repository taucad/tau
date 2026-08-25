/* eslint-disable unicorn/no-process-exit, no-restricted-imports, no-bitwise, tau-lint/no-time-unit-suffix -- Opt-in benchmark harness, not library source: it is a CLI (exit codes are its gate contract), it imports its sibling workload table by relative path because `bench/` is outside the package `imports` map, and its JSON schema field names are fixed by `ocjs/merge-results.mjs`. */
/**
 * Interleaved native-vs-wasm benchmark for the OpenCascade frontier workloads.
 *
 * Engines are round-robined *inside* each round, because a non-interleaved pass
 * on a loaded machine produced up to 5x spurious deltas in the S2 spike. Median
 * and min are both reported; a ratio quoted without its workload is meaningless.
 *
 *   node bench/run-bench.mjs --rounds 5 --iters 9 --out ../../../out/bench/occt
 *
 * Options:
 *   --rounds N      interleaved rounds (default 5)
 *   --iters N       timed iterations per engine per round (default 9)
 *   --warmup N      warmups before the first round, per engine (default 2)
 *   --engines list  subset of native,wasm-single,wasm-multi,cpp (default all available)
 *   --cpp PATH      native C++ control binary (main.cpp harness) for the 1.15x budget
 *   --only PREFIX   comma-separated workload prefixes
 *   --out DIR       write <engine>.json per engine (merge-results.mjs schema)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nativeSamples } from './samples.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const require_ = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const rounds = Number(flag('rounds', 5));
const iters = Number(flag('iters', 9));
const warmup = Number(flag('warmup', 2));
const only = flag('only', '');
const outDir = flag('out', '');
const cppBinary = flag('cpp', '');
const engineFilter = flag('engines', '').split(',').filter(Boolean);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const summarise = (times) => ({
  medianMs: median(times),
  meanMs: times.reduce((a, b) => a + b, 0) / times.length,
  minMs: Math.min(...times),
  maxMs: Math.max(...times),
  samples: times.length,
  timesMs: times,
});

// ---------------------------------------------------------------- engines

/** @type {{ name: string, occt: string, run: (sample: string, n: number) => number[], names: string[], meta?: object }[]} */
const engines = [];

const wanted = (name) => engineFilter.length === 0 || engineFilter.includes(name);

if (wanted('native')) {
  const binding = require_('../src/native/opencascade-native.node');
  const { Solid: solidFactories, ...rest } = binding;
  const oc = {
    ...rest,
    createSolid: {
      box: solidFactories.createBox.bind(solidFactories),
      cylinder: solidFactories.createCylinder.bind(solidFactories),
      sphere: solidFactories.createSphere.bind(solidFactories),
      cone: solidFactories.createCone.bind(solidFactories),
      torus: solidFactories.createTorus.bind(solidFactories),
    },
  };
  const table = nativeSamples(oc);
  const loadStart = performance.now();
  require_('../src/native/opencascade-native.node');
  const cachedRequireMs = performance.now() - loadStart;
  engines.push({
    name: 'native-facade',
    occt: binding.version().occt,
    names: Object.keys(table).sort(),
    meta: { cachedRequireMs, addonBytes: fs.statSync(path.join(here, '../src/native/opencascade-native.node')).size },
    run(sample, n) {
      const fn = table[sample];
      const times = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        fn();
        times.push(performance.now() - t0);
      }
      return times;
    },
  });
}

for (const variant of ['single', 'multi']) {
  const name = `libcascade-${variant}`;
  if (!wanted(name)) continue;
  const dist = path.join(repoRoot, 'node_modules/libcascade/dist');
  if (!fs.existsSync(dist)) continue;
  const { SAMPLES } = await import(
    path.join(repoRoot, 'repos/opencascade.js/experiments/build123d-vs-ocjs/ocjs/samples.mjs')
  );
  const { createInstance } = await import(path.join(dist, `init.${variant}.js`));
  const loadStart = performance.now();
  const oc = await createInstance();
  const kernelReadyMs = performance.now() - loadStart;
  engines.push({
    name,
    occt: '8.0.1',
    names: Object.keys(SAMPLES).sort(),
    meta: { kernelReadyMs, wasmBytes: fs.statSync(path.join(dist, `opencascade_${variant}.wasm`)).size },
    run(sample, n) {
      const fn = SAMPLES[sample];
      const times = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        fn(oc);
        times.push(performance.now() - t0);
      }
      return times;
    },
  });
}

if (cppBinary && wanted('cpp')) {
  // The C++ control cannot share a process, so it interleaves at round
  // granularity: one whole run per round, its own per-sample times pooled in.
  let pending = null;
  engines.push({
    name: 'native-cpp',
    occt: 'linked (see --cpp build)',
    names: [],
    isProcess: true,
    prepareRound(n) {
      const json = execFileSync(cppBinary, ['--warmup', '1', '--iters', String(n), '--engine', 'native-cpp'], {
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      });
      pending = JSON.parse(json).samples;
      this.names = Object.keys(pending).sort();
    },
    run(sample) {
      return pending?.[sample]?.timesMs ?? [];
    },
  });
}

if (engines.length === 0) {
  throw new Error('no engines available');
}

// ---------------------------------------------------------------- run

const allNames = [...new Set(engines.flatMap((engine) => engine.names))]
  .filter((name) => !only || only.split(',').some((prefix) => name.startsWith(prefix)))
  .sort();

const pooled = new Map(engines.map((engine) => [engine.name, new Map()]));

for (const engine of engines) {
  if (engine.isProcess) continue;
  for (const name of allNames) {
    if (!engine.names.includes(name)) continue;
    engine.run(name, warmup);
  }
}

for (let round = 1; round <= rounds; round++) {
  for (const engine of engines) {
    engine.prepareRound?.(iters);
  }
  for (const name of allNames) {
    for (const engine of engines) {
      if (!engine.names.includes(name)) continue;
      const times = engine.run(name, iters);
      const bucket = pooled.get(engine.name);
      bucket.set(name, [...(bucket.get(name) ?? []), ...times]);
    }
  }
  process.stderr.write(`round ${round}/${rounds} done\n`);
}

// ---------------------------------------------------------------- report

const datasets = engines.map((engine) => {
  const samples = {};
  for (const [name, times] of pooled.get(engine.name)) {
    samples[name] = summarise(times);
  }
  return {
    engine: engine.name,
    occtVersion: engine.occt,
    host: { platform: os.platform(), arch: os.arch(), cpus: os.availableParallelism(), node: process.version },
    warmup,
    iterations: iters * rounds,
    rounds,
    interleaved: true,
    ...engine.meta,
    samples,
  };
});

if (outDir) {
  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  for (const dataset of datasets) {
    fs.writeFileSync(path.join(path.resolve(outDir), `${dataset.engine}.json`), JSON.stringify(dataset, null, 2));
  }
}

const baseline = datasets.find((dataset) => dataset.engine === 'native-facade') ?? datasets[0];
const header = ['workload', ...datasets.map((dataset) => dataset.engine)];
const rows = allNames.map((name) => [
  name,
  ...datasets.map((dataset) => {
    const cell = dataset.samples[name];
    if (!cell) return '—';
    const ratio = baseline.samples[name] ? ` (${(cell.medianMs / baseline.samples[name].medianMs).toFixed(2)}x)` : '';
    return `${cell.medianMs.toFixed(3)} / ${cell.minMs.toFixed(3)}${ratio}`;
  }),
]);
const widths = header.map((_, column) => Math.max(...[header, ...rows].map((row) => String(row[column]).length)));
const line = (row) => row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ');
console.log(`# median / min ms, n=${iters * rounds} interleaved, ratios vs ${baseline.engine}`);
console.log(line(header));
for (const row of rows) {
  console.log(line(row));
}

process.exit(0);
