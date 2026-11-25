/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';

import { reproduce } from '#flake-repro-cli.js';
import type { RunContext } from '#flake-repro-cli.js';
import { parseModes } from '#flake-repro.js';
import type { PlanOptions } from '#flake-repro.js';
import { seededDraw } from '#fixtures/flake-repro/seeded-draw.js';

/*
 * FQ-7's acceptance check, run for real: `repeat` on a seeded flaky fixture reports its rate within the binomial
 * interval, and `shuffle` finds a seeded polluter. The fixtures are `*.fixture.ts`, which no suite includes; the
 * Vitest configuration beside them selects them.
 */
const root = resolve(import.meta.dirname, '../..');
const fixtures = resolve(import.meta.dirname, 'fixtures/flake-repro');
const out = mkdtempSync(join(tmpdir(), 'flake-repro-'));

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

/** The outer Vitest's own variables would make the inner one think it is a worker. */
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST') && key !== 'NODE_OPTIONS' && key !== 'TEST'),
);

const context = (file: string, test: string, env: Record<string, string> = {}): RunContext => ({
  root,
  identity: { project: 'fixture', target: 'test', file: resolve(fixtures, file), test },
  launcher: { cwd: fixtures, args: ['--config', 'vitest.config.ts'], filters: [], env: {}, prepare: [] },
  env: { ...cleanEnv, ...env },
  vitest: resolve(root, 'node_modules/.bin/vitest'),
  out,
  deadline: Date.now() + 5 * 60_000,
  attemptTimeout: 60_000,
});

const options = (file: string, test: string, seed: number): PlanOptions & { probeSeeds: number } => ({
  seed,
  file: resolve(fixtures, file),
  test,
  copies: 2,
  faketimeLibrary: undefined,
  taskset: false,
  netPreload: join(out, 'net-preload.mjs'),
  netLatency: 10,
  heapMb: 256,
  year: 2026,
  projectFilters: [],
  probeSeeds: 6,
});

const quiet = (): undefined => undefined;

describe('flake-repro against seeded fixtures', () => {
  it('reports a seeded flake rate within its binomial interval under repeat', { timeout: 180_000 }, async () => {
    const rate = 0.3;
    const attempts = 12;
    const seed = 7;
    const test = 'passes unless its seed draws under the rate';
    const { rows, truncated } = await reproduce(
      context('seeded-flake.fixture.ts', test, { FLAKE_FIXTURE_RATE: String(rate) }),
      {
        variants: parseModes('repeat'),
        attempts,
        options: options('seeded-flake.fixture.ts', test, seed),
        log: quiet,
      },
    );
    const expected = Array.from({ length: attempts }, (_, index) => seed + index).filter(
      (value) => seededDraw(value) < rate,
    );
    expect(expected.length).toBeGreaterThan(0);
    const [row] = rows;
    expect(truncated).toBe(false);
    expect(row).toMatchObject({ mode: 'repeat', variant: 'alone', attempts, failures: expected.length });
    expect(row?.failingSeeds).toEqual(expected);
    expect(row?.wilson.lower).toBeLessThanOrEqual(rate);
    expect(row?.wilson.upper).toBeGreaterThanOrEqual(rate);
    expect(row?.exact.lower).toBeLessThanOrEqual(rate);
    expect(row?.exact.upper).toBeGreaterThanOrEqual(rate);
  });

  it('finds the seeded polluter under shuffle, and nothing under repeat', { timeout: 180_000 }, async () => {
    const test = 'order victim';
    const { rows } = await reproduce(context('polluter.fixture.ts', test), {
      variants: parseModes('repeat,shuffle:file'),
      attempts: 4,
      options: options('polluter.fixture.ts', test, 1),
      log: quiet,
    });
    const [repeat, shuffle] = rows;
    expect(repeat).toMatchObject({ mode: 'repeat', failures: 0, attempts: 4 });
    expect(shuffle?.failures).toBeGreaterThan(0);
    expect(shuffle?.polluter).toMatchObject({ polluter: 'order polluter' });
  });

  it('refuses an identity that names no test', { timeout: 60_000 }, async () => {
    await expect(
      reproduce(context('polluter.fixture.ts', 'no such test'), {
        variants: parseModes('repeat'),
        attempts: 2,
        options: options('polluter.fixture.ts', 'no such test', 1),
        log: quiet,
      }),
    ).rejects.toThrow('has no test named "no such test"');
  });
});
