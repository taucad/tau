/* eslint-disable unicorn/no-process-exit, no-restricted-imports, no-bitwise, tau-lint/no-time-unit-suffix -- Opt-in benchmark harness, not library source: it is a CLI (exit codes are its gate contract), it imports its sibling workload table by relative path because `bench/` is outside the package `imports` map, and its JSON schema field names are fixed by `ocjs/merge-results.mjs`. */
/**
 * Price the facade's two union routes against operand count, and against the
 * native C++ multi-tool `BRepAlgoAPI_Fuse` reference where one is supplied.
 *
 * This is the measurement behind `FUSE_ARITY_THRESHOLD` in
 * `rust/facade/src/boolean.rs`. Routes are interleaved per round for the same
 * reason the main harness interleaves engines.
 *
 *   node bench/boolean-arity.mjs --rounds 5 --iters 5 --arities 2,4,8,16,40
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const binding = require_('../src/native/opencascade-native.node');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const rounds = Number(flag('rounds', 5));
const iters = Number(flag('iters', 5));
const outFile = flag('out', '');
const arities = flag('arities', '2,4,8,16,24,40').split(',').map(Number);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const boxes = (count) =>
  Array.from({ length: count }, (_, index) => {
    const x = index * 3;
    return binding.Solid.createBox([x, 0, 0], [x + 4, 4, 4]);
  });

const routes = ['single', 'tree'];
const pooled = new Map(arities.flatMap((n) => routes.map((route) => [`${n}:${route}`, []])));

// Warm both routes at every arity before timing anything.
for (const n of arities) {
  const operands = boxes(n);
  for (const route of routes) binding.fuseAll(operands, route);
}

for (let round = 1; round <= rounds; round++) {
  for (const n of arities) {
    const operands = boxes(n);
    for (const route of routes) {
      for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        binding.fuseAll(operands, route);
        pooled.get(`${n}:${route}`).push(performance.now() - t0);
      }
    }
  }
  process.stderr.write(`round ${round}/${rounds} done\n`);
}

const rows = arities.map((n) => {
  const single = pooled.get(`${n}:single`);
  const tree = pooled.get(`${n}:tree`);
  return {
    arity: n,
    singleMedianMs: median(single),
    singleMinMs: Math.min(...single),
    treeMedianMs: median(tree),
    treeMinMs: Math.min(...tree),
    treeOverSingle: median(tree) / median(single),
    samples: single.length,
  };
});

const winner = rows.find((row) => row.treeOverSingle < 1);
const report = {
  occt: binding.version().occt,
  package: binding.version().package,
  rounds,
  iters,
  interleaved: true,
  rows,
  // The threshold the facade should compile in: the smallest arity at which the
  // tree route is faster, or `null` when it never is.
  measuredThreshold: winner ? winner.arity : null,
};

console.log('arity  single med/min ms      tree med/min ms        tree/single');
for (const row of rows) {
  console.log(
    `${String(row.arity).padEnd(6)} ${row.singleMedianMs.toFixed(3)} / ${row.singleMinMs.toFixed(3)}`.padEnd(35) +
      `${row.treeMedianMs.toFixed(3)} / ${row.treeMinMs.toFixed(3)}`.padEnd(23) +
      row.treeOverSingle.toFixed(3),
  );
}
console.log(`measured threshold: ${report.measuredThreshold ?? 'none (tree never wins)'}`);

if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(path.resolve(outFile), JSON.stringify(report, null, 2));
}
process.exit(0);
