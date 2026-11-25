/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';

import { collected, runBurnIn } from '#burn-in-cli.js';
import type { ReadyUnit } from '#burn-in-cli.js';
import { burnIn, runSeed } from '#burn-in.js';
import { seededDraw } from '#fixtures/flake-repro/seeded-draw.js';

/*
 * FQ-10's acceptance, run for real on FQ-7's seeded fixtures: ten shuffled runs with no retry catch the seeded flake on
 * exactly the seeds that draw under its rate and the seeded polluter through shuffle, the cap cuts runs short without
 * failing them, and a pull request with no test change plans no job. The fixtures are `*.fixture.ts`, which no suite
 * includes; the Vitest configuration beside them selects them.
 */
const root = resolve(import.meta.dirname, '../..');
const fixtures = resolve(import.meta.dirname, 'fixtures/flake-repro');
const vitest = resolve(root, 'node_modules/.bin/vitest');
const out = mkdtempSync(join(tmpdir(), 'burn-in-'));

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

/** The outer Vitest's own variables would make the inner one think it is a worker. */
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST') && key !== 'NODE_OPTIONS' && key !== 'TEST'),
);

const unit = (files: readonly string[], env: Record<string, string> = {}): ReadyUnit => ({
  project: 'fixture',
  target: 'test',
  launcher: { cwd: fixtures, args: ['--config', 'vitest.config.ts'], filters: [], env: {}, prepare: [] },
  env: { ...cleanEnv, ...env },
  files: files.map((file) => ({ file: `scripts/src/fixtures/flake-repro/${file}`, absolute: resolve(fixtures, file) })),
});

const quiet = (): undefined => undefined;

describe('burn-in against seeded fixtures', () => {
  it('fails a seeded 20 % flake on exactly the seeds that draw under its rate', { timeout: 180_000 }, async () => {
    const rate = 0.2;
    // A first seed whose ten seeds catch the flake, as about 89 % do (burn-in.test.ts).
    const seed = 1000;
    const expected = Array.from({ length: burnIn.runs }, (_, run) => runSeed(seed, run)).filter(
      (value) => seededDraw(value) < rate,
    );
    expect(expected.length).toBeGreaterThan(0);
    const { rows, truncated } = await runBurnIn(
      [unit(['seeded-flake.fixture.ts'], { FLAKE_FIXTURE_RATE: String(rate) })],
      {
        vitest,
        out: join(out, 'seeded'),
        runs: burnIn.runs,
        seed,
        deadline: Date.now() + burnIn.minutes * 60_000,
        log: quiet,
      },
    );
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runs: 10, planned: 10, failures: expected.length, cutShort: false });
    expect(rows[0]?.failingSeeds).toEqual(expected);
    expect(rows[0]?.firstFailure).toContain('passes unless its seed draws under the rate');
  });

  it(
    'passes a file that never fails, and catches an order dependence through shuffle',
    { timeout: 180_000 },
    async () => {
      const { rows } = await runBurnIn(
        [unit(['seeded-flake.fixture.ts', 'polluter.fixture.ts'], { FLAKE_FIXTURE_RATE: '0' })],
        { vitest, out: join(out, 'order'), runs: burnIn.runs, seed: 1, deadline: Date.now() + 5 * 60_000, log: quiet },
      );
      const byFile = Object.fromEntries(rows.map((row) => [row.file.split('/').at(-1) ?? row.file, row]));
      expect(byFile['seeded-flake.fixture.ts']).toMatchObject({ runs: 10, failures: 0 });
      expect(byFile['polluter.fixture.ts']?.runs).toBe(10);
      expect(byFile['polluter.fixture.ts']?.failures).toBeGreaterThan(0);
      expect(byFile['polluter.fixture.ts']?.failures).toBeLessThan(10);
    },
  );

  it(
    'stops at the cap, counts no cut run as a failure and reports the files cut short',
    { timeout: 60_000 },
    async () => {
      const { rows, truncated } = await runBurnIn([unit(['seeded-flake.fixture.ts'], { FLAKE_FIXTURE_RATE: '1' })], {
        vitest,
        out: join(out, 'cap'),
        runs: burnIn.runs,
        seed: 1,
        // Shorter than one Vitest start: the first run is killed and no other starts.
        deadline: Date.now() + 50,
        log: quiet,
      });
      expect(truncated).toBe(true);
      expect(rows[0]).toMatchObject({ runs: 0, planned: 10, failures: 0, cutShort: true });
    },
  );

  it('lists only the files the target’s configuration collects', { timeout: 60_000 }, () => {
    const { launcher, env } = unit([]);
    const files = [resolve(fixtures, 'polluter.fixture.ts'), resolve(fixtures, 'seeded-draw.ts')];
    expect([...collected(launcher, { vitest, files, env: { ...env }, out })]).toEqual([files[0]]);
  });
});

describe('burn-in plan command', () => {
  const graph = join(out, 'graph.json');
  writeFileSync(
    graph,
    JSON.stringify({
      graph: {
        nodes: {
          core: {
            data: {
              root: 'packages/core',
              targets: { test: { executor: 'nx:run-commands', options: { cwd: '{projectRoot}', command: 'vitest' } } },
            },
          },
        },
      },
    }),
  );
  const plan = (files: readonly string[]): string => {
    const output = join(out, `output-${files.length}`);
    writeFileSync(output, '');
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, 'burn-in-cli.ts'), 'plan', '--graph', graph],
      {
        cwd: root,
        input: files.map((file) => `${file}\n`).join(''),
        encoding: 'utf8',
        env: { ...cleanEnv, GITHUB_OUTPUT: output },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    return readFileSync(output, 'utf8');
  };

  it('selects no job for a pull request that changes no test file', () => {
    expect(plan(['packages/core/src/index.ts'])).toBe('burn-in=false\nburn-in-units=[]\n');
  });

  it('writes the units for a pull request that changes a test file', () => {
    expect(plan(['packages/core/src/index.ts', 'packages/core/src/index.test.ts'])).toBe(
      'burn-in=true\nburn-in-units=[{"project":"core","target":"test","files":["packages/core/src/index.test.ts"]}]\n',
    );
  });
});
