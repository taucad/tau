/* eslint-disable unicorn/no-process-exit, no-restricted-imports, no-bitwise, tau-lint/no-time-unit-suffix -- Opt-in benchmark harness, not library source: it is a CLI (exit codes are its gate contract), it imports its sibling workload table by relative path because `bench/` is outside the package `imports` map, and its JSON schema field names are fixed by `ocjs/merge-results.mjs`. */
/**
 * Gated benchmark for `@taucad/opencascade-native`, nanoraster-shaped.
 *
 * Four kinds of gate, all measurements, none of them dates:
 *
 *   budgets      product commitments from the charter (R-G): `require()`,
 *                cold process to first primitive, artifact size.
 *   ratio        `09_fuse_many_boxes` within 1.15x of the native C++ control at
 *                the same OCCT pin (needs `--cpp`).
 *   regression   every workload within +10 % of `bench/baseline.json`.
 *   fingerprint  the synthetic GLB digest is byte-stable; a change fails unless
 *                the case is renamed.
 *
 *   node bench/gated.mjs [--cpp PATH] [--update] [--rounds 3] [--iters 5]
 *
 * `--update` rewrites the baseline from this run; do that deliberately, on a
 * quiet host, and say so in the commit.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nativeSamples, previewTessellation } from './samples.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const addonPath = path.join(here, '../src/native/opencascade-native.node');
const baselinePath = path.join(here, 'baseline.json');
const require_ = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const rounds = Number(flag('rounds', 3));
const iters = Number(flag('iters', 5));
const cppBinary = flag('cpp', '');
const update = argv.includes('--update');

/**
 * Product commitments. `core` applies to a build without the `step` feature,
 * `full` to the default build; the gate picks by probing the artifact's own
 * exports rather than trusting the caller.
 */
const BUDGETS = {
  requireMs: 5,
  coldProcessMs: 60,
  coreAddonMiB: 10,
  fullAddonMiB: 18,
  fuseManyBoxesOverCpp: 1.15,
  /**
   * Regression ceiling, and the absolute delta below which a percentage is
   * noise. On a loaded host the sub-millisecond workloads swing >10 % between
   * back-to-back runs; a gate that fires on 0.08 ms trains people to ignore it.
   */
  regressionRatio: 1.1,
  regressionFloorMs: 0.5,
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const failures = [];
const results = { budgets: {}, samples: {}, fingerprints: {} };
const check = (name, { actual, limit, unit, ok = actual <= limit }) => {
  results.budgets[name] = { actual, limit, unit, pass: ok };
  const verdict = ok ? 'PASS' : 'FAIL';
  console.log(
    `[${verdict}] ${name}: ${typeof actual === 'number' ? actual.toFixed(3) : actual} ${unit} (budget ${limit})`,
  );
  if (!ok) {
    failures.push(`${name}: ${actual} > ${limit} ${unit}`);
  }
};

// ---------------------------------------------------------------- budgets

if (!fs.existsSync(addonPath)) {
  console.error(
    `addon not built: ${addonPath}\nOCCT_ROOT=<prefix> cargo build --release --manifest-path rust/Cargo.toml`,
  );
  process.exit(1);
}

// Cold `require()` in a fresh process, median of 9. The first `dlopen` of a
// newly built artifact pays macOS's 0.36-1.03 s code-directory scan, so the
// gate warms the artifact once before measuring.
const requireProbe = `const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(addonPath)});const t=process.hrtime.bigint();r(${JSON.stringify(addonPath)});process.stdout.write(String(Number(process.hrtime.bigint()-t)/1e6));`;
execFileSync(process.execPath, ['-e', requireProbe], { encoding: 'utf8' });
const requireTimes = Array.from({ length: 9 }, () =>
  Number(execFileSync(process.execPath, ['-e', requireProbe], { encoding: 'utf8' })),
);
check('require()', { actual: median(requireTimes), limit: BUDGETS.requireMs, unit: 'ms' });

// Whole process: node boot + require + one primitive.
const coldProbe = `const {createRequire}=require('node:module');const b=createRequire(${JSON.stringify(addonPath)})(${JSON.stringify(addonPath)});b.Solid.createBox([0,0,0],[10,20,30]);`;
const coldTimes = Array.from({ length: 9 }, () => {
  const start = process.hrtime.bigint();
  execFileSync(process.execPath, ['-e', coldProbe]);
  return Number(process.hrtime.bigint() - start) / 1e6;
});
check('node + require + one primitive', { actual: median(coldTimes), limit: BUDGETS.coldProcessMs, unit: 'ms' });

const binding = require_(addonPath);
const hasStep = typeof binding.readStep === 'function';
const addonMiB = fs.statSync(addonPath).size / 1_048_576;
check(hasStep ? 'full addon size' : 'core addon size', {
  actual: addonMiB,
  limit: hasStep ? BUDGETS.fullAddonMiB : BUDGETS.coreAddonMiB,
  unit: 'MiB',
});

// ---------------------------------------------------------------- fingerprint

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

const fused = oc.fuseAll(
  Array.from({ length: 40 }, (_, index) => oc.createSolid.box([index * 3, 0, 0], [index * 3 + 4, 4, 4])),
);
results.fingerprints['synthetic/40-box-fuse.glb'] = crypto
  .createHash('sha256')
  .update(oc.toGlb([fused], previewTessellation))
  .digest('hex');
results.fingerprints['synthetic/40-box-fuse.brep'] = crypto
  .createHash('sha256')
  .update(oc.writeBrep([fused]))
  .digest('hex');

// ---------------------------------------------------------------- workloads

const table = nativeSamples(oc);
const names = Object.keys(table).sort();
for (const name of names) {
  table[name]();
}

// The C++ control runs *inside* the round loop. A control measured after the
// facade's whole run is a different machine state, and on a loaded host that
// alone moved the ratio from 1.66x to 1.05x.
const runControl = () =>
  JSON.parse(
    execFileSync(cppBinary, ['--warmup', '1', '--iters', String(iters), '--engine', 'native-cpp'], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    }),
  ).samples;

const pooled = new Map(names.map((name) => [name, []]));
const controlPooled = new Map();
for (let round = 1; round <= rounds; round++) {
  if (cppBinary) {
    for (const [name, cell] of Object.entries(runControl())) {
      controlPooled.set(name, [...(controlPooled.get(name) ?? []), ...cell.timesMs]);
    }
  }
  for (const name of names) {
    for (let i = 0; i < iters; i++) {
      const start = performance.now();
      table[name]();
      pooled.get(name).push(performance.now() - start);
    }
  }
}
for (const [name, times] of pooled) {
  results.samples[name] = { medianMs: median(times), minMs: Math.min(...times), samples: times.length };
}

// ---------------------------------------------------------------- ratio gate

if (cppBinary) {
  const ours = results.samples['09_fuse_many_boxes'].medianMs;
  const theirs = median(controlPooled.get('09_fuse_many_boxes') ?? [Number.NaN]);
  check('09_fuse_many_boxes vs native C++', { actual: ours / theirs, limit: BUDGETS.fuseManyBoxesOverCpp, unit: 'x' });
  results.budgets['09_fuse_many_boxes vs native C++'].detail = { facadeMs: ours, cppMs: theirs, interleaved: true };
} else {
  console.log('[SKIP] 09_fuse_many_boxes vs native C++ — pass --cpp <binary> to enforce the ratio budget');
}

// ---------------------------------------------------------------- baseline

const stored = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : undefined;
if (stored) {
  for (const [name, digest] of Object.entries(stored.fingerprints ?? {})) {
    const now = results.fingerprints[name];
    if (now === undefined) {
      console.log(`[WARN] fingerprint case '${name}' disappeared — rename it deliberately`);
      continue;
    }
    if (now !== digest) {
      console.log(`[FAIL] fingerprint ${name}: ${digest.slice(0, 12)} -> ${now.slice(0, 12)}`);
      failures.push(`fingerprint changed for ${name}`);
    }
  }
  for (const [name, cell] of Object.entries(stored.samples ?? {})) {
    const now = results.samples[name];
    if (!now) {
      continue;
    }
    const ratio = now.medianMs / cell.medianMs;
    const ok = ratio <= BUDGETS.regressionRatio || now.medianMs - cell.medianMs < BUDGETS.regressionFloorMs;
    console.log(
      `[${ok ? 'PASS' : 'FAIL'}] ${name}: ${now.medianMs.toFixed(3)} ms vs ${cell.medianMs.toFixed(3)} ms (${ratio.toFixed(3)}x)`,
    );
    if (!ok) {
      failures.push(`${name} regressed ${((ratio - 1) * 100).toFixed(1)} %`);
    }
  }
} else {
  console.log('[SKIP] no baseline — run with --update on a quiet host to create one');
}

if (update) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        occt: binding.version().occt,
        package: binding.version().package,
        host: { platform: process.platform, arch: process.arch, node: process.version },
        note: 'medians from a shared host; treat as a ceiling, not a spec',
        samples: results.samples,
        fingerprints: results.fingerprints,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`baseline written to ${baselinePath}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} gate failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log('\nall gates passed');
process.exit(0);
