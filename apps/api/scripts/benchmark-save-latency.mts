#!/usr/bin/env node
/**
 * DV1 save-latency benchmark: the client wall time of a Tau Sync push, from `git commit` to the push
 * acknowledged (git's report-status received, which the API withholds until the manifest commit lands).
 * Run it once per Hosted Remote Storage arm (in-process git, forwarded to tau-storage, rendezvous
 * affinity) against the same API and compare the tables; `--label` names the arm in the output.
 *
 * Per project size it seeds a fixed-size project of text files (the seed push is its own row), then:
 * - sequential: one project, `--sequential` commit+push cycles one after another;
 * - concurrent: `--concurrent` projects pushing at once, `--concurrent-rounds` times.
 * Each measured push rewrites one file at its own length, so the project stays its fixed size and the
 * pack is one file. A push git refuses (exit non-zero: 429, 503, a refused ref, a timeout) is counted as
 * a failure and left out of the percentiles; its last stderr line is printed.
 *
 * Pushes go over git smart HTTP to `/v1/git/<project>.git` exactly as exercise-observability.mts and a
 * desktop or daemon host push does. Projects are registered as `bench-<run>-<size>-<n>` and left in the
 * account for its normal cleanup; each run spends that many of the account's daily registrations.
 *
 * Required env: TAU_BENCH_API (API origin, e.g. http://localhost:4000), TAU_AUTH_TOKEN (a session token
 *   or an `sk_` API key for an account entitled to Tau Sync; read from env, never printed).
 * Usage: node apps/api/scripts/benchmark-save-latency.mts [--sizes=16k,256k,4m --sequential=20
 *   --concurrent=4 --concurrent-rounds=5 --push-timeout=120 --label=forwarded-rendezvous --json]
 * Production (api.tau.new) is refused. Exit codes: 0 every push succeeded, 1 a push failed or a precondition was refused.
 */
/* oxlint-disable no-await-in-loop -- the sequential phase is sequential by design */
/* eslint-disable @typescript-eslint/naming-convention -- env and HTTP header names */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The latency summary of one row: sample count and nearest-rank percentiles, in milliseconds. */
export type LatencySummary = {
  readonly count: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
};

/**
 * The nearest-rank percentile of a sample: the smallest value at least `percentile`% of the sample is at or
 * below. Nearest-rank, not interpolated, so every figure printed is a push that happened; with fewer than
 * 100 samples p99 is the maximum.
 *
 * @param sorted - The sample, ascending.
 * @param percentile - 0 (exclusive) to 100 (inclusive).
 * @returns The percentile, or `Number.NaN` for an empty sample.
 */
export const nearestRank = (sorted: readonly number[], percentile: number): number => {
  if (!(percentile > 0 && percentile <= 100)) {
    throw new RangeError(`percentile must be in (0, 100], got ${String(percentile)}`);
  }
  if (sorted.length === 0) {
    return Number.NaN;
  }
  return sorted[Math.ceil((percentile / 100) * sorted.length) - 1]!;
};

/**
 * Summarizes one row's push durations.
 *
 * @param samples - Durations in milliseconds, any order.
 * @returns The count, p50/p90/p99, min, max and mean; `NaN` figures for an empty sample.
 */
export const summarize = (samples: readonly number[]): LatencySummary => {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: nearestRank(sorted, 50),
    p90: nearestRank(sorted, 90),
    p99: nearestRank(sorted, 99),
    min: sorted.length === 0 ? Number.NaN : sorted[0]!,
    max: sorted.length === 0 ? Number.NaN : sorted.at(-1)!,
    mean: sorted.length === 0 ? Number.NaN : sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
};

const sizeUnits: Readonly<Record<string, number>> = {
  '': 1,
  k: 1024,
  m: 1024 ** 2,
};

/**
 * Parses a project size flag: bytes, or a whole number with a `k` or `m` (binary) suffix.
 *
 * @param value - e.g. `16k`, `4m`, `65536`.
 * @returns The size in bytes.
 * @throws RangeError When the value is not a positive size of at most 64 MiB.
 */
export const parseSize = (value: string): number => {
  const match = /^(?<amount>\d+)(?<unit>[km]?)$/iu.exec(value.trim());
  const bytes =
    match?.groups === undefined
      ? Number.NaN
      : Number(match.groups['amount']) * sizeUnits[match.groups['unit']!.toLowerCase()]!;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 64 * 1024 ** 2) {
    throw new RangeError(`a size is 1 byte to 64m, got "${value}"`);
  }
  return bytes;
};

/** One size as the tables print it. */
export const formatSize = (bytes: number): string =>
  bytes % 1024 ** 2 === 0
    ? `${String(bytes / 1024 ** 2)}m`
    : bytes % 1024 === 0
      ? `${String(bytes / 1024)}k`
      : `${String(bytes)}b`;

/** One printed row: which phase and size, its summary, and its failures. */
export type BenchmarkRow = {
  readonly phase: 'seed' | 'sequential' | 'concurrent';
  readonly sizeBytes: number;
  readonly summary: LatencySummary;
  readonly failures: number;
};

const milliseconds = (value: number): string => (Number.isNaN(value) ? '-' : String(Math.round(value)));

/**
 * Renders rows as a fixed-width table, milliseconds throughout.
 *
 * @param rows - The rows, in print order.
 * @returns The table, header first.
 */
export const formatTable = (rows: readonly BenchmarkRow[]): string => {
  const header = ['phase', 'size', 'n', 'fail', 'p50 ms', 'p90 ms', 'p99 ms', 'min ms', 'max ms', 'mean ms'];
  const body = rows.map((row) => [
    row.phase,
    formatSize(row.sizeBytes),
    String(row.summary.count),
    String(row.failures),
    ...[row.summary.p50, row.summary.p90, row.summary.p99, row.summary.min, row.summary.max, row.summary.mean].map(
      (value) => milliseconds(value),
    ),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...body.map((cells) => cells[column]!.length)));
  return [header, ...body]
    .map((cells) => cells.map((cell, column) => cell.padStart(widths[column]!)).join('  '))
    .join('\n');
};

// ---------------------------------------------------------------------------------------------

/** Each project file's size: a source-sized text file, so no file approaches an LFS threshold. */
const fileBytes = 32 * 1024;

type PushResult =
  | { readonly ok: true; readonly milliseconds: number }
  | { readonly ok: false; readonly reason: string };

type Project = {
  readonly id: string;
  readonly directory: string;
  readonly files: readonly string[];
  readonly lengths: readonly number[];
  edits: number;
};

/** Text that does not compress away: base64 of random bytes, cut to `length`. */
const text = (length: number): string =>
  randomBytes(Math.ceil((length * 3) / 4) + 3)
    .toString('base64')
    .slice(0, length);

const benchmark = async (): Promise<number> => {
  const { values } = parseArgs({
    options: {
      sizes: { type: 'string', default: '16k,256k,4m' },
      sequential: { type: 'string', default: '20' },
      concurrent: { type: 'string', default: '4' },
      'concurrent-rounds': { type: 'string', default: '5' },
      'push-timeout': { type: 'string', default: '120' },
      label: { type: 'string', default: '' },
      json: { type: 'boolean', default: false },
    },
  });
  const count = (flag: string, value: string, minimum: number): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) {
      throw new Error(`--${flag} must be a whole number of at least ${String(minimum)} (got "${value}")`);
    }
    return parsed;
  };
  const sizes = values.sizes
    .split(',')
    .filter(Boolean)
    .map((size) => parseSize(size));
  const sequential = count('sequential', values.sequential, 0);
  const concurrent = count('concurrent', values.concurrent, 0);
  const concurrentRounds = count('concurrent-rounds', values['concurrent-rounds'], 1);
  const pushTimeoutMilliseconds = count('push-timeout', values['push-timeout'], 1) * 1000;

  const apiValue = process.env['TAU_BENCH_API'];
  const credential = process.env['TAU_AUTH_TOKEN'];
  if (apiValue === undefined || apiValue === '' || credential === undefined || credential === '') {
    console.error('TAU_BENCH_API and TAU_AUTH_TOKEN must be set (see the header of this script).');
    return 1;
  }
  const api = new URL(apiValue);
  if (api.hostname === 'api.tau.new') {
    console.error(`Refusing the production API ${api.origin}.`);
    return 1;
  }
  /* The REST credential header the API's guard reads, and the Basic password git sends: the git
     middleware turns that password back into the same credential (`git-transport.ts`). */
  const restAuthorization: Record<string, string> = credential.startsWith('sk_')
    ? { 'x-api-key': credential }
    : { authorization: `Bearer ${credential}` };
  const gitAuthorization = `Authorization: Basic ${Buffer.from(`tau:${credential}`).toString('base64')}`;

  const root = await mkdtemp(join(tmpdir(), 'tau-save-latency-'));
  const run = Date.now().toString(36);
  const gitConfig: Array<[string, string]> = [
    ['commit.gpgsign', 'false'],
    ['user.name', 'Tau save-latency benchmark'],
    ['user.email', 'bench@example.test'],
    [`http.${api.origin}/.extraHeader`, gitAuthorization],
  ];
  /* The credential reaches git as GIT_CONFIG_* rather than `-c`, so it is never on argv. */
  const gitEnvironment: Record<string, string | undefined> = {
    PATH: process.env['PATH'],
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: String(gitConfig.length),
    ...Object.fromEntries(
      gitConfig.flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${String(index)}`, key],
        [`GIT_CONFIG_VALUE_${String(index)}`, value],
      ]),
    ),
  };

  const git = async (args: readonly string[], cwd: string, timeoutMilliseconds = 60_000): Promise<string | undefined> =>
    new Promise((resolve) => {
      const child = spawn('git', args, {
        cwd,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the child env excludes API-required ambient variables
        env: gitEnvironment as unknown as NodeJS.ProcessEnv,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-4096);
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMilliseconds);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const last = stderr.trim().split('\n').at(-1)?.slice(0, 200) ?? '';
        resolve(code === 0 ? undefined : signal === 'SIGKILL' ? 'timed out' : last || `git exited ${String(code)}`);
      });
    });

  const createProject = async (sizeBytes: number, index: number): Promise<Project> => {
    const id = `bench-${run}-${formatSize(sizeBytes)}-${String(index)}`;
    const registered = await fetch(new URL(`/v1/projects/${id}`, api), {
      method: 'PUT',
      redirect: 'error',
      headers: { ...restAuthorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Save latency ${formatSize(sizeBytes)} ${String(index)}`,
      }),
    });
    await registered.body?.cancel();
    if (!registered.ok) {
      throw new Error(`registering ${id} answered ${String(registered.status)}`);
    }
    const directory = join(root, id);
    await mkdir(directory);
    const lengths = Array.from({ length: Math.ceil(sizeBytes / fileBytes) }, (_, file) =>
      Math.min(fileBytes, sizeBytes - file * fileBytes),
    );
    const files = lengths.map((_, file) => `part-${String(file).padStart(4, '0')}.txt`);
    await Promise.all(files.map(async (file, position) => writeFile(join(directory, file), text(lengths[position]!))));
    const refused =
      (await git(['init', '-q', '-b', 'main'], directory)) ??
      (await git(['remote', 'add', 'origin', new URL(`/v1/git/${id}.git`, api).href], directory)) ??
      (await git(['add', '-A'], directory));
    if (refused !== undefined) {
      throw new Error(`preparing ${id}: ${refused}`);
    }
    return { id, directory, files, lengths, edits: 0 };
  };

  /* Commit to acknowledged: the clock starts before `git commit` and stops when `git push` exits. */
  const commitAndPush = async (project: Project, seed: boolean): Promise<PushResult> => {
    if (!seed) {
      const position = project.edits % project.files.length;
      await writeFile(join(project.directory, project.files[position]!), text(project.lengths[position]!));
    }
    project.edits += 1;
    const startedAt = performance.now();
    const refused =
      (await git(['commit', '-q', '-a', '-m', seed ? 'Seed' : `Edit ${String(project.edits)}`], project.directory)) ??
      (await git(['push', '-q', 'origin', 'main'], project.directory, pushTimeoutMilliseconds));
    return refused === undefined
      ? { ok: true, milliseconds: performance.now() - startedAt }
      : { ok: false, reason: refused };
  };

  const rows: BenchmarkRow[] = [];
  const failures: string[] = [];
  const record = (phase: BenchmarkRow['phase'], sizeBytes: number, results: readonly PushResult[]): void => {
    const samples = results.flatMap((result) => (result.ok ? [result.milliseconds] : []));
    for (const result of results) {
      if (!result.ok) {
        failures.push(`${phase} ${formatSize(sizeBytes)}: ${result.reason}`);
      }
    }
    rows.push({
      phase,
      sizeBytes,
      summary: summarize(samples),
      failures: results.length - samples.length,
    });
  };

  try {
    for (const sizeBytes of sizes) {
      const seeds: PushResult[] = [];
      if (sequential > 0) {
        const project = await createProject(sizeBytes, 0);
        seeds.push(await commitAndPush(project, true));
        const results: PushResult[] = [];
        for (let push = 0; push < sequential; push += 1) {
          results.push(await commitAndPush(project, false));
        }
        record('sequential', sizeBytes, results);
      }
      if (concurrent > 0) {
        const projects = await Promise.all(
          Array.from({ length: concurrent }, async (_, index) => createProject(sizeBytes, index + 1)),
        );
        seeds.push(...(await Promise.all(projects.map(async (project) => commitAndPush(project, true)))));
        const results: PushResult[] = [];
        for (let round = 0; round < concurrentRounds; round += 1) {
          results.push(...(await Promise.all(projects.map(async (project) => commitAndPush(project, false)))));
        }
        record('concurrent', sizeBytes, results);
      }
      record('seed', sizeBytes, seeds);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  if (values.json) {
    console.log(JSON.stringify({ label: values.label, api: api.origin, run, rows, failures }, undefined, 2));
  } else {
    console.log(
      `Save latency, commit to push acknowledged${values.label === '' ? '' : ` (${values.label})`}: ${api.origin}, run ${run}`,
    );
    console.log(formatTable(rows));
    for (const failure of failures) {
      console.log(`  ✗ ${failure}`);
    }
  }
  return failures.length === 0 ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await benchmark().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  });
}
