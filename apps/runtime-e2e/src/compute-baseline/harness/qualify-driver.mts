/**
 * Qualification driver (audit R5): runs `qualify-arm.mts` in fresh child processes, one per model, scenario,
 * arm and pair, with arms alternated inside each pair (pair 1 off-first, pair 2 off-last, ...) so arms of one
 * model share a time window. Writes one raw JSON per child and an `index.json` the summarizer reads.
 *
 * Usage (repository root):
 *   pnpm nx compute-qualify runtime-e2e                     # full program matrix, seven models
 *   node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-driver.mts \
 *     --models gridfinity-box,turbofan --arms off,memory --scenarios matrix,history --pairs 3
 *
 * A child that exits non-zero is recorded with its error and the driver exits non-zero at the end; nothing is
 * dropped silently (Q5). Every child records its load average per step; the driver records it per child.
 *
 * Plugging in an arm (seam, live tier, mesh memo): add it to `qualify-arm.mts` as a new `--arm` value that
 * configures the kernel or transport differently, then pass it here with `--arms off,<new>`; the summarizer
 * compares every arm against `off` for byte parity and against each other for timing.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { qualifyModelNames } from './qualify-corpus.mts';
import { repoRoot } from './repo-root.mts';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: qualifyModelNames.join(',') },
    arms: { type: 'string', default: 'off,memory' },
    scenarios: { type: 'string', default: 'matrix,scrub,agent,history,abort' },
    pairs: { type: 'string', default: '1' },
    histories: { type: 'string', default: '10' },
    /** The history gate compares reuse arms against `off`'s matrix hashes; it runs once (pair 1) per arm. */
    historyArms: { type: 'string', default: 'memory,durable' },
    /** Scenarios repeated in every pair; the others run in pair 1 only (history always runs once). */
    pairScenarios: { type: 'string', default: 'matrix,scrub,agent,abort' },
    seed: { type: 'string', default: '1' },
    content: { type: 'string', default: 'ui' },
    wasm: { type: 'string', default: 'single' },
    out: { type: 'string' },
    timeout: { type: 'string', default: '3600' },
    /** Extra arguments passed to every child, e.g. `--extra=--keepStore`. */
    extra: { type: 'string', default: '' },
  },
});

const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
const out = resolve(repoRoot, values.out ?? `out/reports/compute-qualify/${stamp}`);
mkdirSync(out, { recursive: true });
const runner = resolve(import.meta.dirname, 'qualify-arm.mts');
const arms = values.arms.split(',');
const index: any = {
  stamp,
  host: { cpu: cpus()[0]?.model, cpus: cpus().length, node: process.version, loadavgAtStart: loadavg() },
  options: values,
  runs: [] as any[],
};
const writeIndex = () => writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));

let failed = 0;
for (const model of values.models.split(',')) {
  for (let pair = 1; pair <= Number(values.pairs); pair += 1) {
    for (const scenario of values.scenarios.split(',')) {
      // Alternate arm order per pair so neither arm always runs first in a window.
      // The abort scenario runs on a worker thread, which takes the off and memory arms only.
      const armsOf =
        scenario === 'history'
          ? values.historyArms.split(',')
          : scenario === 'abort'
            ? arms.filter((arm) => arm !== 'durable')
            : arms;
      if (pair > 1 && (scenario === 'history' || !values.pairScenarios.split(',').includes(scenario))) continue;
      const order = pair % 2 === 1 ? armsOf : [...armsOf].reverse();
      for (const arm of order) {
        const file = join(out, `${model}.${scenario}.${arm}.p${pair}.json`);
        const args = [
          '--import',
          '@oxc-node/core/register',
          runner,
          '--model',
          model,
          '--arm',
          arm,
          '--scenario',
          scenario,
          '--content',
          values.content,
          '--wasm',
          values.wasm,
          '--histories',
          values.histories,
          '--seed',
          String(Number(values.seed) + pair - 1),
          '--label',
          `p${pair}`,
          '--out',
          file,
          ...(values.extra ? values.extra.split(' ') : []),
        ];
        const load = loadavg();
        const started = Date.now();
        console.error(
          `[driver] ${model} ${scenario} ${arm} pair ${pair} (load ${load.map((value) => value.toFixed(1)).join(' ')})`,
        );
        const result = spawnSync(process.execPath, args, {
          cwd: repoRoot,
          stdio: ['ignore', 'inherit', 'inherit'],
          timeout: Number(values.timeout) * 1000,
          env: { ...process.env, NODE_OPTIONS: '' },
        });
        const ok = result.status === 0 && existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).complete === true;
        if (!ok) failed += 1;
        index.runs.push({
          model,
          scenario,
          arm,
          pair,
          file: file.slice(out.length + 1),
          ok,
          status: result.status,
          signal: result.signal,
          loadavg: load,
          elapsedMs: Date.now() - started,
        });
        writeIndex();
      }
    }
  }
}
index.host.loadavgAtEnd = loadavg();
writeIndex();
console.error(`[driver] wrote ${out}/index.json (${index.runs.length} runs, ${failed} failed)`);
if (failed > 0) process.exitCode = 1;
