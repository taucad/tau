/* eslint-disable @typescript-eslint/naming-convention -- Runs are GitHub REST JSON. */
/**
 * A seeded flaky regression for the flake-regression tests: a synthetic ledger history in which one test passes 322 pushes to
 * `main` and starts flaking after commit {@link culpritCommit} lands, beside an ordinary flake and a one-off event,
 * and a stubbed `flake-repro` runner that reproduces the regression from the culprit on.
 */
import { emptyState, ingestRun } from '#ci-flake-ledger-state.js';
import type { IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';
import type { Prober, ProbeReport } from '#flake-regression.js';

/** Commit n of the synthetic `main`: its number in hex, as a 40-character sha. */
export const commitSha = (n: number): string => n.toString(16).padStart(40, '0');
/** The commit number of a synthetic sha. */
export const commitNumber = (sha: string): number => Number.parseInt(sha, 16);

/** Pushes to `main` in the history: push n tests commit n and is CI run n. */
export const pushes = 340;
/** The landing that introduces the race. */
export const culpritCommit = 321;
/** The runs where the regressed test failed and passed on its retry. */
export const regressionRuns = [323, 331] as const;
/** An ordinary flake: events every few dozen executions from run 300, never 300 apart. */
export const ordinaryRuns = [300, 310, 330, 333] as const;
/** A stable test with one event: it does not meet the entry rule. */
export const oneOffRuns = [330] as const;

export const regressedId = 'scripts › src/victim.test.ts > victim > should settle the queue';
export const ordinaryId = 'scripts › src/ordinary.test.ts > ordinary > should flake';
export const oneOffId = 'scripts › src/one-off.test.ts > one-off > should flake once';
const stableId = 'scripts › src/stable.test.ts > stable > should pass';

/** When run n completed: one an hour from 2026-11-01. */
export const runAt = (n: number): string => new Date(Date.UTC(2026, 10, 1) + n * 3_600_000).toISOString();

export const pushRun = (n: number): IngestRun => ({
  id: n,
  event: 'push',
  head_branch: 'main',
  head_sha: commitSha(n),
  status: 'completed',
  conclusion: 'success',
  created_at: runAt(n),
  updated_at: runAt(n),
  html_url: `https://github.com/taucad/tau/actions/runs/${n}`,
  run_attempt: 1,
});

/** One passing outcome row of `id` in run n, retried when `flaky`. */
export const outcomeRow = (id: string, run: number, flaky: boolean): OutcomeRow => {
  const [, location = ''] = id.split(' › ');
  return {
    kind: 'test',
    id,
    project: 'scripts',
    target: 'test',
    targetKey: 'test',
    file: location.split(' > ')[0],
    variant: { os: 'linux', arch: 'x64' },
    state: 'passed',
    retryCount: flaky ? 1 : 0,
    flaky,
    durationMs: 12,
    errors: flaky ? ['AssertionError: expected the queue to settle'] : [],
    hash: `hash-${run}`,
    run,
    attempt: 1,
    job: 'scripts-test',
  };
};

/** The ledger state after every push of the history is ingested. */
export const seededLedger = (): LedgerState => {
  const state = emptyState(new Date(runAt(0)));
  const flakes: ReadonlyArray<readonly [string, readonly number[]]> = [
    [regressedId, regressionRuns],
    [ordinaryId, ordinaryRuns],
    [oneOffId, oneOffRuns],
  ];
  for (let n = 1; n <= pushes; n += 1) {
    const rows = [stableId, ...flakes.map(([id]) => id)].map((id) =>
      outcomeRow(
        id,
        n,
        flakes.some(([flaky, runs]) => flaky === id && runs.includes(n)),
      ),
    );
    ingestRun(state, { run: pushRun(n), rows, artifacts: 1, rejected: 0 });
  }
  return state;
};

/** A small deterministic generator (Park–Miller), so a probe's draws depend only on its commit and seed. */
const random = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  let value = (seed % (modulus - 1)) + 1;
  return () => {
    value = (value * 48_271) % modulus;
    return value / modulus;
  };
};

/** Every variant a request's modes name, as `flake-repro.ts` deals them. */
const variantsOf = (modes: string): string[] =>
  modes
    .split(',')
    .flatMap((mode) =>
      mode.includes(':')
        ? [mode]
        : mode === 'repeat'
          ? ['repeat:alone']
          : mode === 'cpu'
            ? ['cpu:stress', 'cpu:pinned']
            : mode === 'parallel'
              ? ['parallel:copies']
              : [`${mode}:default`],
    );

export type StubOptions = {
  /** Commit numbers from which the test fails, per variant at this rate. */
  readonly culprit: number;
  readonly rates: Readonly<Record<string, number>>;
  /** The test does not exist before this commit. */
  readonly addedAt?: number;
  /** Runner-minutes each probe reports. */
  readonly minutes?: number;
  /** Commits whose dispatch produces no report. */
  readonly broken?: readonly number[];
  readonly seed?: number;
};

/** A stubbed `flake-repro.yml`: reproduces at `rates` from the culprit on, never before it. Records each request. */
export const stubProber = (options: StubOptions): { prober: Prober; requests: Array<Parameters<Prober>[0]> } => {
  const requests: Array<Parameters<Prober>[0]> = [];
  const prober: Prober = async (request) => {
    requests.push(request);
    const commit = commitNumber(request.sha);
    const minutes = Math.min(options.minutes ?? 20, request.minutes);
    const report: ProbeReport = {
      sha: request.sha,
      rows: [],
      minutes,
      run: { id: 9000 + requests.length, url: `https://github.com/taucad/tau/actions/runs/${9000 + requests.length}` },
    };
    if (options.broken?.includes(commit)) {
      return { ...report, error: 'no report (failure)' };
    }
    const draw = random(commit * 7919 + (options.seed ?? 1));
    return {
      ...report,
      rows: variantsOf(request.modes).map((key) => {
        if (options.addedAt !== undefined && commit < options.addedAt) {
          return { key, outcomes: { missing: request.attempts } };
        }
        const rate = commit >= options.culprit ? (options.rates[key] ?? 0) : 0;
        let failed = 0;
        for (let attempt = 0; attempt < request.attempts; attempt += 1) {
          failed += draw() < rate ? 1 : 0;
        }
        return { key, outcomes: { passed: request.attempts - failed, failed } };
      }),
    };
  };
  return { prober, requests };
};
