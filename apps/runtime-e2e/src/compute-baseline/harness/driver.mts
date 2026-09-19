/**
 * Lane B driver: paired, interleaved, serial arm runs in fresh child processes.
 * Usage (repo root, Node 24):
 *   pnpm nx compute-baseline runtime-e2e
 * or directly:
 *   node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/driver.mts \
 *     --models parity-box,stress-test --arms bypass,durable,memory --pairs 5 --steps cold,warm,late,early,unrelated --restart
 * Every child records os.loadavg() per step; the driver records `uptime` before each child.
 */
import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { loadavg } from 'node:os';
import { repoRoot } from './repo-root.mts';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: 'drone' },
    arms: { type: 'string', default: 'bypass,durable,memory' },
    pairs: { type: 'string', default: '5' },
    steps: { type: 'string', default: 'cold,warm,late,early,unrelated' },
    restart: { type: 'boolean', default: false },
    restartSteps: { type: 'string', default: 'restart,late' },
    stores: { type: 'string', default: join(tmpdir(), 'compute-baseline-stores') },
    out: { type: 'string', default: 'out/reports/compute-baseline' },
    content: { type: 'string', default: 'bare' },
    libraryTracing: { type: 'string', default: 'off' },
    wasm: { type: 'string', default: 'auto' },
    brepDigest: { type: 'boolean', default: false },
    trace: { type: 'string', default: 'off' },
    keepStores: { type: 'boolean', default: false },
    tag: { type: 'string', default: '' },
    timeout: { type: 'string', default: '1800' },
  },
});

/**
 * Admission gate: a campaign started under load produces raw files that wear an
 * admitted tag while carrying inadmissible numbers. Refuse, unless the operator
 * records an explicit override.
 */
const admission = {
  loadavg: loadavg(),
  admitted: loadavg()[0]! < 3,
  override: process.env['TAU_COMPUTE_BASELINE_ADMIT'] === '1',
};
if (!admission.admitted && !admission.override) {
  console.error(
    `[driver] REFUSED: 1-minute load average ${admission.loadavg[0]!.toFixed(2)} is not below 3 (${admission.loadavg.map((value) => value.toFixed(2)).join(' ')}). Wait for a quiet window, or set TAU_COMPUTE_BASELINE_ADMIT=1 to record an explicit override in every raw file.`,
  );
  process.exit(1);
}
console.error(
  `[driver] admission: 1-min load ${admission.loadavg[0]!.toFixed(2)}, admitted=${admission.admitted}, override=${admission.override}`,
);

const repo = repoRoot;
const node = process.execPath;
const runner = resolve(import.meta.dirname, 'run-arm.mts');
const hooks = resolve(import.meta.dirname, 'hooks.mjs');
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
mkdirSync(resolve(repo, values.out), { recursive: true });

const runChild = (args: string[], out: string) => {
  const uptime = execSync('uptime').toString().trim();
  const started = Date.now();
  // Q5: every child records its own executed-source provenance; a run without it fails.
  const loadLog = `${out}.loaded.jsonl`;
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(loadLog, '');
  const result = spawnSync(
    node,
    ['--import', '@oxc-node/core/register', '--import', hooks, runner, ...args, '--out', out],
    {
      cwd: repo,
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: Number(values.timeout) * 1000,
      env: { ...process.env, NODE_OPTIONS: '', TAU_COMPUTE_BASELINE_LOAD_LOG: loadLog },
    },
  );
  if (result.status !== 0)
    return {
      ok: false,
      partial: existsSync(out),
      uptime,
      status: result.status,
      signal: result.signal,
      elapsedMs: Date.now() - started,
      ...(existsSync(out) ? { report: JSON.parse(readFileSync(out, 'utf8')) } : {}),
    };
  return { ok: true, uptime, elapsedMs: Date.now() - started, report: JSON.parse(readFileSync(out, 'utf8')) };
};

for (const model of values.models.split(',')) {
  const arms = values.arms.split(',');
  const runs: any[] = [];
  const file = resolve(repo, values.out, `${model}${values.tag ? `-${values.tag}` : ''}-${stamp}.json`);
  for (let pair = 1; pair <= Number(values.pairs); pair += 1) {
    for (const arm of arms) {
      const store = join(values.stores, `${model}-${arm}-${pair}-${stamp}`);
      rmSync(store, { recursive: true, force: true });
      const base = [
        `--model`,
        model,
        `--arm`,
        arm,
        `--store`,
        store,
        `--steps`,
        values.steps,
        `--content`,
        values.content,
        `--libraryTracing`,
        values.libraryTracing,
        `--wasm`,
        values.wasm,
        `--trace`,
        values.trace,
        ...(values.brepDigest ? ['--brepDigest'] : []),
        `--label`,
        `pair${pair}`,
      ];
      console.error(
        `\n[driver] ${model} pair ${pair} arm ${arm} (load ${loadavg()
          .map((v) => v.toFixed(1))
          .join(' ')})`,
      );
      const first = runChild(base, join(store, 'lane-b-result.json'));
      runs.push({ model, arm, pair, phase: 'first', ...first });
      writeFileSync(
        file,
        JSON.stringify(
          {
            model,
            arms,
            pairs: Number(values.pairs),
            steps: values.steps,
            restartSteps: values.restart ? values.restartSteps : null,
            content: values.content,
            trace: values.trace,
            wasm: values.wasm,
            libraryTracing: values.libraryTracing,
            brepDigest: values.brepDigest,
            stamp,
            admission,
            runs,
          },
          null,
          2,
        ),
      );
      if (values.restart && arm !== 'memory' && first.ok) {
        console.error(
          `[driver] ${model} pair ${pair} arm ${arm} restart (load ${loadavg()
            .map((v) => v.toFixed(1))
            .join(' ')})`,
        );
        const second = runChild(
          [...base.slice(0, 7), values.restartSteps, ...base.slice(8, -2), '--label', `pair${pair}-restart`],
          join(store, 'lane-b-restart.json'),
        );
        runs.push({ model, arm, pair, phase: 'restart', ...second });
        writeFileSync(
          file,
          JSON.stringify(
            {
              model,
              arms,
              pairs: Number(values.pairs),
              steps: values.steps,
              restartSteps: values.restartSteps,
              content: values.content,
              trace: values.trace,
              stamp,
              admission,
              runs,
            },
            null,
            2,
          ),
        );
      }
      if (!values.keepStores && existsSync(store)) rmSync(store, { recursive: true, force: true });
    }
  }
  console.error(`[driver] wrote ${file}`);
}
