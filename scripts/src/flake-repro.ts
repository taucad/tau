/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names and GitHub REST JSON fields. */
/**
 * Flake reproduction under stress: the pure half of `flake-repro.yml` (`flake-repro-cli.ts` does the IO).
 *
 * Brain `research/ci-flake-quarantine-blueprint.md`, D7 and work package FQ-7. The flake agent dispatches the
 * workflow with one test's identity (project, target, file, full test name) and a list of modes; each mode runs the
 * test in fresh Vitest processes with no retry and records failures over attempts. The report is the agent's only
 * accepted proof: a fix is verified by the mode that reproduced, with n straight passes where (1 − k/m)ⁿ ≤ 1 % and
 * n ≥ 100 ({@link proofRuns}).
 *
 * A mode has one or more variants; `attempts` is per variant, and attempts are dealt round-robin across the
 * variants so a run cut short by its minute budget still has balanced rows. Attempt i carries seed `seed + i`
 * (`TAU_FLAKE_REPRO_SEED`), which `shuffle` also hands to `--sequence.seed`.
 *
 * | Mode | Variants | How |
 * | --- | --- | --- |
 * | `repeat` | `alone` | The test alone (`-t`), N fresh processes |
 * | `suite` | `file`, `project` | Its whole file, then the target's whole suite |
 * | `shuffle` | `file`, `project` | `--sequence.shuffle --sequence.seed=<n>` over seeds; the first failing seed is bisected to the polluter ({@link findPolluter}). `project` turns file parallelism off so files share one worker in order |
 * | `cpu` | `stress`, `pinned` | Busy loops on every core, or the run pinned to one core with `taskset` |
 * | `parallel` | `copies` | `copies` concurrent processes of the test with file parallelism on: shared ports, temp paths and services collide |
 * | `clock` | `tz-plus14`, `tz-minus11`, `year-end`, `dst` | Far time zones; a clock started just before a year boundary and a daylight-saving change (libfaketime) |
 * | `net` | `latency` | `globalThis.fetch` in every test process delayed, and its first request failed |
 * | `mem` | `tight-heap` | `--max-old-space-size` small and a 1 MB semi-space, so collections are frequent |
 */
import { resolve } from 'node:path';

/** The reproduction modes of D7, in the order they are run. */
export const modeVariants = {
  repeat: ['alone'],
  suite: ['file', 'project'],
  shuffle: ['file', 'project'],
  cpu: ['stress', 'pinned'],
  parallel: ['copies'],
  clock: ['tz-plus14', 'tz-minus11', 'year-end', 'dst'],
  net: ['latency'],
  mem: ['tight-heap'],
} as const satisfies Record<string, readonly string[]>;

export type Mode = keyof typeof modeVariants;

/** One variant of one mode: the unit a report row describes. */
export type Variant = { readonly mode: Mode; readonly variant: string };

/** The kill-switch and budget limits of D7 and A3. */
export const limits = {
  /** Runs of this workflow at once (three investigations). */
  concurrent: 3,
  /** Runner-minutes of this workflow in seven days. */
  weeklyMinutes: 3000,
  /** The per-dispatch cap on the job, in minutes; the per-flake budget is 300. */
  dispatchMinutes: 120,
} as const;

const isMode = (value: string): value is Mode => Object.hasOwn(modeVariants, value);

/**
 * The variants a `modes` input names: `mode` for all of its variants, `mode:variant` for one. Comma or whitespace
 * separated; repeats are dropped and the result follows the table order. Throws on an unknown name.
 */
export const parseModes = (text: string): Variant[] => {
  const wanted = new Set<string>();
  for (const token of text.split(/[\s,]+/u).filter(Boolean)) {
    const [mode = '', variant] = token.split(':');
    if (!isMode(mode)) {
      throw new Error(`unknown mode \`${mode}\` (modes: ${Object.keys(modeVariants).join(', ')})`);
    }
    const variants: readonly string[] = modeVariants[mode];
    if (variant !== undefined && !variants.includes(variant)) {
      throw new Error(`unknown variant \`${token}\` (${mode}: ${variants.join(', ')})`);
    }
    for (const name of variant === undefined ? variants : [variant]) {
      wanted.add(`${mode}:${name}`);
    }
  }
  if (wanted.size === 0) {
    throw new Error('no mode given');
  }
  return Object.entries(modeVariants).flatMap(([mode, variants]) =>
    variants.filter((variant) => wanted.has(`${mode}:${variant}`)).map((variant) => ({ mode: mode as Mode, variant })),
  );
};

/** A row's key, `mode:variant`. */
export const variantKey = ({ mode, variant }: Variant): string => `${mode}:${variant}`;

// ---------------------------------------------------------------------------------------------------------------
// Rates and intervals.

/** z for a two-sided 95 % interval. */
const z95 = 1.959963984540054;

export type Interval = { readonly lower: number; readonly upper: number };

/** Wilson score interval for k failures in n attempts (two-sided, 95 % by default). n = 0 gives [0, 1]. */
export const wilsonInterval = (k: number, n: number, z = z95): Interval => {
  if (n === 0) {
    return { lower: 0, upper: 1 };
  }
  if (k === 0 || k === n) {
    // The closed form: one bound is the observed rate itself.
    const bound = (z * z) / (n + z * z);
    return k === 0 ? { lower: 0, upper: bound } : { lower: 1 - bound, upper: 1 };
  }
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
};

/** P(X ≤ k) for X ~ Binomial(n, p), summed in log space so large n does not underflow. */
export const binomialCdf = (k: number, n: number, p: number): number => {
  if (k < 0) {
    return 0;
  }
  if (k >= n || p <= 0) {
    return 1;
  }
  if (p >= 1) {
    return 0;
  }
  // Log of P(X = 0).
  let logTerm = n * Math.log1p(-p);
  let sum = Math.exp(logTerm);
  for (let index = 1; index <= k; index++) {
    logTerm += Math.log((n - index + 1) / index) + Math.log(p) - Math.log1p(-p);
    sum += Math.exp(logTerm);
  }
  return Math.min(1, sum);
};

/** The p in [0, 1] where `f` (monotone decreasing in p) crosses `target`, by bisection. */
const solveDecreasing = (f: (p: number) => number, target: number): number => {
  let [low, high] = [0, 1];
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (f(middle) > target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
};

/** Clopper–Pearson exact interval for k failures in n attempts (two-sided, 95 % by default). */
export const exactInterval = (k: number, n: number, alpha = 0.05): Interval => {
  if (n === 0) {
    return { lower: 0, upper: 1 };
  }
  const lower = k === 0 ? 0 : solveDecreasing((p) => binomialCdf(k - 1, n, p), 1 - alpha / 2);
  const upper = k === n ? 1 : solveDecreasing((p) => binomialCdf(k, n, p), alpha / 2);
  return { lower, upper };
};

/** The fewest straight passes D7 accepts as proof of a fix. */
export const minimumProofRuns = 100;

/**
 * The straight passes a fix must show after a mode reproduced k failures in m attempts: the least n with
 * (1 − k/m)ⁿ ≤ 1 %, and at least {@link minimumProofRuns}. Undefined when nothing reproduced (k = 0).
 */
export const proofRuns = (k: number, m: number): number | undefined => {
  if (k === 0 || m === 0) {
    return undefined;
  }
  if (k >= m) {
    return minimumProofRuns;
  }
  return Math.max(minimumProofRuns, Math.ceil(Math.log(0.01) / Math.log(1 - k / m)));
};

// ---------------------------------------------------------------------------------------------------------------
// Attempt plans.

/** A test's identity: the Nx project and target that run it, its file (workspace-relative) and full name. */
export type Identity = {
  readonly project: string;
  readonly target: string;
  readonly file: string;
  /** Vitest's full name: the describe titles and the test title joined by spaces. */
  readonly test: string;
};

/** Escape a string for use inside a regular expression. */
export const escapeRegExp = (text: string): string => text.replaceAll(/[\\^$.*+?()[\]{}|/-]/gu, String.raw`\$&`);

/** A `--testNamePattern` that matches exactly the given full names. */
export const namePattern = (names: readonly string[]): string =>
  `^(?:${names.map((name) => escapeRegExp(name)).join('|')})$`;

/** What the run knows about the machine and the options the variants read. */
export type PlanOptions = {
  /** The first seed; attempt i has seed `seed + i`. */
  readonly seed: number;
  /** Absolute path of the test file (Vitest matches it exactly). */
  readonly file: string;
  readonly test: string;
  /** Concurrent processes for `parallel` (at least 2). */
  readonly copies: number;
  /** The libfaketime shared object, when installed; `clock:year-end` and `clock:dst` need it. */
  readonly faketimeLibrary: string | undefined;
  /** Whether `taskset` is on PATH; `cpu:pinned` needs it. */
  readonly taskset: boolean;
  /** Absolute path of the `net` preload module. */
  readonly netPreload: string;
  /** Added latency per request in `net`. Milliseconds. */
  readonly netLatency: number;
  /** Old-space limit in `mem`, in MB. */
  readonly heapMb: number;
  /** The year whose boundaries `clock` crosses. */
  readonly year: number;
  /** The target's own file filters, which the `project` variants keep (relative to the launcher's `cwd`). */
  readonly projectFilters: readonly string[];
};

/** How one attempt runs: Vitest arguments after the target's own, extra env, Node options and a wrapper. */
export type AttemptPlan = {
  readonly seed: number;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly nodeOptions: readonly string[];
  /** A command the Vitest process runs under (`taskset -c 0`). */
  readonly wrapper: readonly string[];
  /** Concurrent copies of the process; the attempt fails when any copy's test fails. */
  readonly copies: number;
  /** Busy-loop every core for the attempt's duration. */
  readonly cpuStress: boolean;
};

/** Why a variant cannot run on this machine, or undefined when it can. */
export const unavailable = ({ mode, variant }: Variant, options: PlanOptions): string | undefined => {
  if (mode === 'clock' && (variant === 'year-end' || variant === 'dst') && !options.faketimeLibrary) {
    return 'libfaketime is not installed (apt package `faketime`)';
  }
  if (mode === 'cpu' && variant === 'pinned' && !options.taskset) {
    return '`taskset` is not on PATH';
  }
  return undefined;
};

/** The second Sunday of March: the United States' spring-forward date. */
const springForward = (year: number): string => {
  const firstOfMarch = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const day = 1 + ((7 - firstOfMarch) % 7) + 7;
  return `${year}-03-${String(day).padStart(2, '0')}`;
};

/** The arguments, env and wrapper of attempt `index` (0-based) of a variant. */
export const attemptPlan = ({ mode, variant }: Variant, index: number, options: PlanOptions): AttemptPlan => {
  const seed = options.seed + index;
  const alone = [options.file, '--testNamePattern', namePattern([options.test])];
  const plan: AttemptPlan = {
    seed,
    args: alone,
    env: { TAU_FLAKE_REPRO_SEED: String(seed), TAU_FLAKE_REPRO_ATTEMPT: String(index) },
    nodeOptions: [],
    wrapper: [],
    copies: 1,
    cpuStress: false,
  };
  const shuffle = ['--sequence.shuffle', `--sequence.seed=${seed}`];
  const faketime = (at: string, zone: string): Record<string, string> => ({
    ...plan.env,
    LD_PRELOAD: options.faketimeLibrary ?? '',
    FAKETIME: `@${at}`,
    FAKETIME_DONT_FAKE_MONOTONIC: '1',
    TZ: zone,
  });

  switch (`${mode}:${variant}`) {
    case 'suite:file': {
      return { ...plan, args: [options.file] };
    }
    case 'suite:project': {
      return { ...plan, args: [...options.projectFilters] };
    }
    case 'shuffle:file': {
      return { ...plan, args: [options.file, ...shuffle] };
    }
    case 'shuffle:project': {
      return { ...plan, args: ['--no-file-parallelism', ...options.projectFilters, ...shuffle] };
    }
    case 'cpu:stress': {
      return { ...plan, cpuStress: true };
    }
    case 'cpu:pinned': {
      return { ...plan, wrapper: ['taskset', '-c', '0'] };
    }
    case 'parallel:copies': {
      return { ...plan, args: [...alone, '--file-parallelism'], copies: Math.max(2, options.copies) };
    }
    case 'clock:tz-plus14': {
      return { ...plan, env: { ...plan.env, TZ: 'Pacific/Kiritimati' } };
    }
    case 'clock:tz-minus11': {
      return { ...plan, env: { ...plan.env, TZ: 'Pacific/Pago_Pago' } };
    }
    case 'clock:year-end': {
      return { ...plan, env: faketime(`${options.year}-12-31 23:59:50`, 'UTC') };
    }
    case 'clock:dst': {
      return { ...plan, env: faketime(`${springForward(options.year)} 01:59:50`, 'America/New_York') };
    }
    case 'net:latency': {
      return {
        ...plan,
        env: { ...plan.env, TAU_FLAKE_REPRO_NET_LATENCY_MS: String(options.netLatency) },
        nodeOptions: [`--import=${new URL(`file://${options.netPreload}`).href}`],
      };
    }
    case 'mem:tight-heap': {
      return { ...plan, nodeOptions: [`--max-old-space-size=${options.heapMb}`, '--max-semi-space-size=1'] };
    }
    default: {
      return plan;
    }
  }
};

/**
 * The `net` preload: every `fetch` in the process waits `TAU_FLAKE_REPRO_NET_LATENCY_MS`, and the first one fails
 * as an offline request does. Written next to the report and loaded with `--import`.
 */
export const netPreloadSource = `// flake-repro net mode (scripts/src/flake-repro.ts)
const latency = Number(process.env.TAU_FLAKE_REPRO_NET_LATENCY_MS ?? '300');
const original = globalThis.fetch;
let dropped = false;
if (typeof original === 'function') {
  globalThis.fetch = async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, latency));
    if (!dropped) {
      dropped = true;
      throw new TypeError('fetch failed (flake-repro net mode dropped the first request)');
    }
    return original(...args);
  };
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Reading Vitest's JSON report.

/** The parts of Vitest's `json` reporter output this script reads. */
export type VitestJsonReport = {
  readonly testResults?: ReadonlyArray<{
    readonly name: string;
    readonly assertionResults?: ReadonlyArray<{
      readonly fullName: string;
      readonly status: string;
      /** `null` in Vitest's output when there is none; read only through optional chaining. */
      readonly failureMessages?: readonly string[];
    }>;
  }>;
};

/**
 * - `passed` / `failed`: the test ran.
 * - `missing`: the report does not list it as run (wrong identity, or filtered out).
 * - `error`: no report (the process crashed, or Vitest failed before reporting).
 * - `timeout`: the attempt outlived its limit and was killed.
 */
export type Outcome = 'passed' | 'failed' | 'missing' | 'error' | 'timeout';

/** The target test's outcome in a report, and its first failure message. */
export const testOutcome = (
  report: VitestJsonReport | undefined,
  file: string,
  test: string,
): { readonly outcome: Outcome; readonly message?: string } => {
  if (!report) {
    return { outcome: 'error' };
  }
  const result = report.testResults
    ?.find((entry) => entry.name === file)
    ?.assertionResults?.find((entry) => entry.fullName === test);
  if (result?.status === 'passed') {
    return { outcome: 'passed' };
  }
  if (result?.status === 'failed') {
    const message = result.failureMessages?.[0];
    return message === undefined ? { outcome: 'failed' } : { outcome: 'failed', message };
  }
  return { outcome: 'missing' };
};

/** The other tests of the file (by full name) and the other files a report ran: a polluter's candidates. */
export const pollutionUnits = (
  report: VitestJsonReport | undefined,
  { file, test, scope }: { readonly file: string; readonly test: string; readonly scope: 'file' | 'project' },
): string[] => {
  const results = report?.testResults ?? [];
  if (scope === 'project') {
    return results.map((entry) => entry.name).filter((name) => name !== file);
  }
  return (results.find((entry) => entry.name === file)?.assertionResults ?? [])
    .filter((entry) => entry.fullName !== test && (entry.status === 'passed' || entry.status === 'failed'))
    .map((entry) => entry.fullName);
};

/** A failing attempt counts against the test: a failed assertion, a crash or a timeout. */
export const isFailure = (outcome: Outcome): boolean =>
  outcome === 'failed' || outcome === 'error' || outcome === 'timeout';

// ---------------------------------------------------------------------------------------------------------------
// Polluter search.

/** The polluter search's result: one test or file, or the candidates it could not split. */
export type PolluterSearch = {
  readonly polluter: string | undefined;
  readonly candidates: readonly string[];
  readonly probes: number;
  /** Why the search stopped short of one unit. */
  readonly note?: string;
};

/**
 * Bisect `units` to the one whose presence makes the victim fail. `probe(set)` runs the victim with `set` under
 * several shuffle seeds and resolves true when it failed. Each step keeps the half that still fails; when neither
 * half fails alone the polluter needs both, and the search reports the candidates left. A final probe confirms a
 * single unit. `probe` may return undefined when the budget ran out, which ends the search.
 */
export const findPolluter = async (
  units: readonly string[],
  probe: (set: readonly string[]) => Promise<boolean | undefined>,
): Promise<PolluterSearch> => {
  let candidates = [...units];
  let probes = 0;
  const run = async (set: readonly string[]): Promise<boolean | undefined> => {
    probes++;
    return probe(set);
  };
  if (candidates.length === 0) {
    return { polluter: undefined, candidates, probes, note: 'no other test ran with the victim' };
  }
  while (candidates.length > 1) {
    const middle = Math.ceil(candidates.length / 2);
    const halves = [candidates.slice(0, middle), candidates.slice(middle)];
    let kept: string[] | undefined;
    for (const half of halves) {
      // oxlint-disable-next-line no-await-in-loop -- each probe decides the next; they share the runner
      const failed = await run(half);
      if (failed === undefined) {
        return { polluter: undefined, candidates, probes, note: 'budget ran out during the search' };
      }
      if (failed) {
        kept = half;
        break;
      }
    }
    if (!kept) {
      return { polluter: undefined, candidates, probes, note: 'neither half fails alone; the pollution needs both' };
    }
    candidates = kept;
  }
  const confirmed = await run(candidates);
  if (confirmed === undefined) {
    return { polluter: undefined, candidates, probes, note: 'budget ran out during the search' };
  }
  return confirmed
    ? { polluter: candidates[0], candidates, probes }
    : { polluter: undefined, candidates, probes, note: 'the last candidate did not reproduce alone' };
};

// ---------------------------------------------------------------------------------------------------------------
// Rows and the report.

/** One attempt as recorded. */
export type Attempt = {
  readonly index: number;
  readonly seed: number;
  readonly outcome: Outcome;
  readonly durationMs: number;
  readonly message?: string;
  /** Workspace-relative path of the attempt's log. */
  readonly log?: string;
};

export type Row = Variant & {
  readonly attempts: number;
  readonly failures: number;
  readonly rate: number;
  readonly wilson: Interval;
  readonly exact: Interval;
  /** Straight passes a fix must show in this variant ({@link proofRuns}). */
  readonly proofRuns: number | undefined;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
  readonly seeds: readonly number[];
  readonly failingSeeds: readonly number[];
  readonly durationMs: { readonly total: number; readonly median: number; readonly p90: number; readonly max: number };
  /** The first three failures, with their messages cut to 1,000 characters. */
  readonly firstFailures: ReadonlyArray<Pick<Attempt, 'index' | 'seed' | 'outcome' | 'message' | 'log'>>;
  /** The budget ended the variant before its attempts were done. */
  readonly truncated: boolean;
  /** Why the variant did not run on this machine. */
  readonly unavailable?: string;
  readonly polluter?: PolluterSearch;
};

const quantile = (sorted: readonly number[], q: number): number =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0);

/** A report row from a variant's attempts. `missing` attempts are not counted: they did not run the test. */
export const summarizeRow = (
  variant: Variant,
  attempts: readonly Attempt[],
  extra: { readonly planned: number; readonly unavailable?: string; readonly polluter?: PolluterSearch },
): Row => {
  const { planned, ...rest } = extra;
  const counted = attempts.filter((attempt) => attempt.outcome !== 'missing');
  const failed = counted.filter((attempt) => isFailure(attempt.outcome));
  const durations = attempts.map((attempt) => attempt.durationMs).toSorted((a, b) => a - b);
  const outcomes: Partial<Record<Outcome, number>> = {};
  for (const attempt of attempts) {
    outcomes[attempt.outcome] = (outcomes[attempt.outcome] ?? 0) + 1;
  }
  return {
    ...variant,
    attempts: counted.length,
    failures: failed.length,
    rate: counted.length === 0 ? 0 : failed.length / counted.length,
    wilson: wilsonInterval(failed.length, counted.length),
    exact: exactInterval(failed.length, counted.length),
    proofRuns: proofRuns(failed.length, counted.length),
    outcomes,
    seeds: attempts.map((attempt) => attempt.seed),
    failingSeeds: failed.map((attempt) => attempt.seed),
    durationMs: {
      total: durations.reduce((sum, value) => sum + value, 0),
      median: quantile(durations, 0.5),
      p90: quantile(durations, 0.9),
      max: durations.at(-1) ?? 0,
    },
    firstFailures: failed.slice(0, 3).map(({ index, seed, outcome, message, log }) => ({
      index,
      seed,
      outcome,
      ...(message === undefined ? {} : { message: message.slice(0, 1000) }),
      ...(log === undefined ? {} : { log }),
    })),
    truncated: !extra.unavailable && attempts.length < planned,
    ...rest,
  };
};

export type Report = {
  readonly schema: 'flake-repro/1';
  readonly identity: Identity;
  readonly ref: string | undefined;
  readonly sha: string | undefined;
  readonly seed: number;
  readonly attemptsPerVariant: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** Wall minutes the run spent, warm-up included. */
  readonly minutes: number;
  readonly launcher: { readonly cwd: string; readonly command: readonly string[]; readonly prepare: readonly string[] };
  readonly environment: Readonly<Record<string, string | number | undefined>>;
  readonly rows: readonly Row[];
  /** `reproduced` when any row has a failure; the agent reads the rows, not only this. */
  readonly verdict: 'reproduced' | 'not-reproduced';
  readonly truncated: boolean;
};

const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;

/** The Markdown job summary of a report. */
export const renderSummary = (report: Report): string => {
  const { identity } = report;
  const lines = [
    `## Flake reproduction: ${report.verdict === 'reproduced' ? 'reproduced' : 'not reproduced'}`,
    '',
    `\`${identity.project}:${identity.target}\` · \`${identity.file}\` · ${JSON.stringify(identity.test)}`,
    '',
    `Ref \`${report.ref ?? 'HEAD'}\` (${report.sha?.slice(0, 12) ?? 'unknown'}), seed ${report.seed}, ${report.attemptsPerVariant} attempts per variant, ${report.minutes.toFixed(1)} min${report.truncated ? ', **cut short by the minute budget**' : ''}.`,
    '',
    '| Mode | Failures / attempts | Rate | 95 % Wilson | 95 % exact | Passes to prove a fix | Median / p90 s | Failing seeds |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    if (row.unavailable) {
      lines.push(`| \`${variantKey(row)}\` | not run: ${row.unavailable} | | | | | | |`);
      continue;
    }
    const cells = [
      `\`${variantKey(row)}\`${row.truncated ? ' (cut short)' : ''}`,
      `${row.failures} / ${row.attempts}`,
      percent(row.rate),
      `${percent(row.wilson.lower)} – ${percent(row.wilson.upper)}`,
      `${percent(row.exact.lower)} – ${percent(row.exact.upper)}`,
      row.proofRuns === undefined ? '—' : String(row.proofRuns),
      `${(row.durationMs.median / 1000).toFixed(1)} / ${(row.durationMs.p90 / 1000).toFixed(1)}`,
      row.failingSeeds.slice(0, 10).join(', ') + (row.failingSeeds.length > 10 ? ', …' : ''),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  const searches = report.rows.filter((row) => row.polluter);
  for (const row of searches) {
    const search = row.polluter;
    if (!search) {
      continue;
    }
    lines.push(
      '',
      search.polluter === undefined
        ? `**Polluter (\`${variantKey(row)}\`):** not isolated after ${search.probes} probes; ${search.note ?? ''} (${search.candidates.length} candidates left).`
        : `**Polluter (\`${variantKey(row)}\`):** \`${search.polluter}\`, isolated in ${search.probes} probes.`,
    );
  }
  lines.push('', 'The JSON report and every attempt log are in the run artifact.');
  return `${lines.join('\n')}\n`;
};

// ---------------------------------------------------------------------------------------------------------------
// The admission gate.

/** The fields of a workflow run the gate reads. */
export type GateRun = {
  readonly id: number;
  readonly status: string;
  readonly created_at: string;
  /** `null` before the run starts; read only with `??`. */
  readonly run_started_at?: string;
  readonly updated_at: string;
};

const activeStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

export type GateDecision = {
  readonly admitted: boolean;
  readonly reason: string;
  /** Runs of the workflow ahead of this one and still going. */
  readonly ahead: readonly number[];
  /** Wall minutes of this workflow's runs in the window, other than this one. */
  readonly weekMinutes: number;
};

/**
 * Admit this run when fewer than {@link limits.concurrent} earlier runs of the workflow are still going and the
 * workflow's runs in the last seven days (`runs`, this one included or not) took under {@link limits.weeklyMinutes}
 * minutes. A run's minutes are its wall time from start to its last update (to `now` while it is going), which for
 * this one-job workflow is its runner time.
 */
export const admit = (runs: readonly GateRun[], self: number, now: Date): GateDecision => {
  const others = runs.filter((run) => run.id !== self);
  const ahead = others.filter((run) => run.id < self && activeStatuses.has(run.status)).map((run) => run.id);
  let weekMinutes = 0;
  for (const run of others) {
    const start = Date.parse(run.run_started_at ?? run.created_at);
    const end = activeStatuses.has(run.status) ? now.getTime() : Date.parse(run.updated_at);
    weekMinutes += Math.max(0, end - start) / 60_000;
  }
  if (ahead.length >= limits.concurrent) {
    return {
      admitted: false,
      reason: `${ahead.length} earlier runs are still going (limit ${limits.concurrent}); dispatch again when one ends`,
      ahead,
      weekMinutes,
    };
  }
  if (weekMinutes >= limits.weeklyMinutes) {
    return {
      admitted: false,
      reason: `${Math.round(weekMinutes)} runner-minutes in the last 7 days (limit ${limits.weeklyMinutes})`,
      ahead,
      weekMinutes,
    };
  }
  return { admitted: true, reason: 'admitted', ahead, weekMinutes };
};

// ---------------------------------------------------------------------------------------------------------------
// The target's launcher.

/** The parts of `nx show project --json` this script reads. */
export type ProjectTarget = {
  readonly executor?: string;
  readonly options?: {
    readonly cwd?: string;
    readonly command?: string;
    readonly commands?: ReadonlyArray<string | { readonly command: string }>;
    readonly env?: Readonly<Record<string, string>>;
  };
};

/** How the target runs Vitest: its working directory, the Vitest arguments it keeps, and commands to run first. */
export type Launcher = {
  readonly cwd: string;
  /** Vitest's arguments from the target's command, minus its file filters and the flags this script sets. */
  readonly args: readonly string[];
  /** The target's own file filters, which the `project` variants keep. */
  readonly filters: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** The target's other commands (a UI build), run once in `cwd` before the attempts. */
  readonly prepare: readonly string[];
};

/** Split a command line on whitespace, honouring single and double quotes. Throws on shell syntax. */
export const splitCommand = (command: string): string[] => {
  if (/[;&|<>`$()]/u.test(command.replaceAll(/'[^']*'|"[^"$`]*"/gu, ''))) {
    throw new Error(`\`${command}\` is shell syntax, not one command`);
  }
  const tokens: string[] = [];
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
};

const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/** Flags this script sets itself; the target's value is dropped. Those listed with `true` take a value. */
const ownedFlags = new Map<string, boolean>([
  ['--run', false],
  ['--retry', true],
  ['--reporter', true],
  ['--outputFile', true],
  ['--testNamePattern', true],
  ['-t', true],
  ['--sequence.shuffle', false],
  ['--sequence.seed', true],
  ['--file-parallelism', false],
  ['--fileParallelism', false],
  ['--no-file-parallelism', false],
]);

/** The Vitest arguments of one command (`vitest run …`, `pnpm --dir x exec vitest …`), and the directory it moves to. */
const vitestArguments = (
  tokens: readonly string[],
): { readonly directory: string | undefined; readonly args: string[]; readonly filters: string[] } | undefined => {
  const at = tokens.indexOf('vitest');
  const prefix = tokens.slice(0, at);
  if (at === -1 || (at > 0 && (prefix[0] !== 'pnpm' || prefix.at(-1) !== 'exec'))) {
    return undefined;
  }
  const directoryAt = prefix.indexOf('--dir');
  const directory = directoryAt === -1 ? undefined : prefix[directoryAt + 1];
  const args: string[] = [];
  const filters: string[] = [];
  const rest = tokens.slice(at + 1);
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] ?? '';
    const name = token.split('=')[0] ?? token;
    const owned = ownedFlags.get(name) ?? (name.startsWith('--outputFile.') ? true : undefined);
    if (owned !== undefined) {
      if (owned && !token.includes('=')) {
        index++;
      }
      continue;
    }
    if (index === 0 && token === 'run') {
      continue;
    }
    if (testFile.test(token)) {
      filters.push(token);
      continue;
    }
    args.push(token);
  }
  return { directory, args, filters };
};

/**
 * The launcher of an Nx target that runs Vitest through `nx:run-commands`. With several Vitest commands (one per
 * browser), `commandIndex` picks one; otherwise the first that names the file, else the first. Throws for any
 * other executor.
 */
export const resolveLauncher = (
  target: ProjectTarget,
  where: {
    readonly workspace: string;
    readonly project: string;
    /** The test file, workspace-relative. */
    readonly file: string;
    readonly commandIndex?: number;
  },
): Launcher => {
  const { file, commandIndex } = where;
  if (target.executor !== 'nx:run-commands') {
    throw new Error(
      `the target's executor is ${target.executor ?? 'unset'}; only nx:run-commands Vitest targets are supported`,
    );
  }
  const options = target.options ?? {};
  const commands = (options.commands ?? (options.command === undefined ? [] : [options.command])).map((entry) =>
    typeof entry === 'string' ? entry : entry.command,
  );
  const interpolate = (path: string): string =>
    path.replaceAll('{workspaceRoot}', where.workspace).replaceAll('{projectRoot}', where.project);
  const cwd = resolve(where.workspace, interpolate(options.cwd ?? '{workspaceRoot}'));
  const parsed = commands.map((command) => {
    try {
      return vitestArguments(splitCommand(command));
    } catch {
      return undefined;
    }
  });
  const vitest = parsed.flatMap((entry, index) => (entry ? [{ index, entry }] : []));
  if (vitest.length === 0) {
    throw new Error('the target runs no plain `vitest` command');
  }
  const base = file.split('/').at(-1) ?? file;
  const chosen =
    commandIndex === undefined
      ? (vitest.find(({ index }) => commands[index]?.includes(base)) ?? vitest[0])
      : vitest.find(({ index }) => index === commandIndex);
  if (!chosen) {
    throw new Error(`command ${commandIndex} of the target is not a Vitest command`);
  }
  const resolvedCwd = chosen.entry.directory === undefined ? cwd : resolve(cwd, chosen.entry.directory);
  return {
    cwd: resolvedCwd,
    args: chosen.entry.args,
    filters: chosen.entry.filters,
    env: options.env ?? {},
    prepare: commands.filter((_, index) => parsed[index] === undefined),
  };
};

/** The dotenv files Nx loads for a target, highest precedence first (a file never overrides an earlier one). */
export const dotenvFiles = (target: string): string[] => [
  `.env.${target}.local`,
  `.env.${target}`,
  '.env.local',
  '.env',
  `.${target}.local.env`,
  `.${target}.env`,
  '.local.env',
];

const browsers = new Set(['chromium', 'firefox', 'webkit']);

/** The Playwright browsers a launcher's `--project` flags select, which the run installs before its attempts. */
export const browsersFor = (launcher: Pick<Launcher, 'args'>): string[] =>
  launcher.args.flatMap((token, index) => {
    const value = token.startsWith('--project=')
      ? token.slice('--project='.length)
      : token === '--project'
        ? launcher.args[index + 1]
        : undefined;
    return value !== undefined && browsers.has(value) ? [value] : [];
  });
