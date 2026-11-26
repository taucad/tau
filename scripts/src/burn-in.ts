/**
 * Burn-in of changed tests on pull requests: the pure half of `ci.yml`'s `burn-in` job (`burn-in-cli.ts` does the IO).
 *
 * Brain `research/ci-flake-quarantine-blueprint.md`, work package FQ-10 and operator decision O6 (B): the test files a
 * pull request adds or modifies run ten times with shuffle, capped at five minutes, in the pull request's own checks;
 * a failure there fails the pull request, and a pull request that changes no test file adds no job. Ten runs catch a
 * 20 % flake 89 % of the time and a 5 % one 40 % ({@link detectionProbability}). Every run has no retry (RT-3: a
 * changed test gets no credit for a retry) and its own recorded seed, so a failing order reproduces with
 * `--sequence.seed`, or through `flake-repro.yml` (FQ-7).
 *
 * The scope is the target the pull request's own test lanes run: a file is burned in through its Nx project's `test`
 * target (the deepest project root above it, as Nx maps files), outside the `scope:api` and `ci:nightly-only` projects
 * the lanes also leave out. A changed file that no such target runs is listed with the reason and not burned in.
 */
import { resolve } from 'node:path';

import { resolveLauncher } from '#flake-repro.js';
import type { ProjectTarget } from '#flake-repro.js';

/** O6 (B): runs per file and the wall cap on the runs, in minutes. */
export const burnIn = { runs: 10, minutes: 5 } as const;

/** The target burned in: the one the pull request's affected test lanes run. */
export const burnInTarget = 'test';

/** P(a flake failing each run independently with probability `rate` fails at least one of `runs`). */
export const detectionProbability = (rate: number, runs: number = burnIn.runs): number => 1 - (1 - rate) ** runs;

/** A Vitest test file, by Tau's naming (`*.test.ts`, `*.spec.tsx`, …). */
export const isTestFile = (path: string): boolean => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path);

/** Project tags the pull request's test lanes leave out, and why. */
export const excludedTags: Readonly<Record<string, string>> = {
  'scope:api': 'an API suite: it needs PostgreSQL and MinIO, which the API lane provides',
  'ci:nightly-only': 'a `ci:nightly-only` project: only the nightly runs its suites',
};

/** The parts of `nx graph --file` nodes the plan reads. */
export type GraphNodes = Readonly<
  Record<
    string,
    {
      readonly data: {
        readonly root: string;
        readonly tags?: readonly string[];
        readonly targets?: Readonly<Record<string, ProjectTarget>>;
      };
    }
  >
>;

/** One Vitest target to burn in, with its changed files (workspace-relative). */
export type BurnInUnit = { readonly project: string; readonly target: string; readonly files: readonly string[] };

/** A changed test file that is not burned in, and why. */
export type Skipped = { readonly file: string; readonly reason: string };

export type BurnInPlan = { readonly units: readonly BurnInUnit[]; readonly skipped: readonly Skipped[] };

/** The project that owns a workspace-relative path: the deepest project root above it, as Nx maps files. */
export const ownerOf = (nodes: GraphNodes, file: string): string | undefined => {
  const roots = new Map<string, string>();
  for (const [name, node] of Object.entries(nodes)) {
    roots.set(node.data.root.replace(/\/$/u, '') || '.', name);
  }
  const parts = file.split('/');
  for (let depth = parts.length - 1; depth > 0; depth--) {
    const owner = roots.get(parts.slice(0, depth).join('/'));
    if (owner !== undefined) {
      return owner;
    }
  }
  return roots.get('.');
};

/**
 * Whether a project, target or file name may reach a burn-in run. The run passes names to Vitest as arguments, never
 * through a shell, so `$` (React Router's route folders, `w.$workspace.$project`) is as plain as a letter; the rest
 * still keeps a name to path characters and out of parent directories.
 */
export const isRunnableName = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w@.:/$-]+$/u.test(value) && !value.includes('..');

/**
 * Map a pull request's added and modified files to the targets that burn them in. Non-test files are ignored; each
 * test file joins its owner's `test` target unless the project is excluded, has no such target, the target is not a
 * plain Vitest command, or the target's own file list leaves the file out.
 */
export const planBurnIn = (files: readonly string[], nodes: GraphNodes, workspace: string): BurnInPlan => {
  const byProject = new Map<string, string[]>();
  const skipped: Skipped[] = [];
  for (const file of [...new Set(files.filter((path) => isTestFile(path)))].toSorted()) {
    if (!isRunnableName(file)) {
      skipped.push({ file, reason: 'its path has characters a burn-in run does not accept' });
      continue;
    }
    const project = ownerOf(nodes, file);
    const node = project === undefined ? undefined : nodes[project];
    if (project === undefined || node === undefined) {
      skipped.push({ file, reason: 'no Nx project owns it' });
      continue;
    }
    const excluded = (node.data.tags ?? []).find((tag) => Object.hasOwn(excludedTags, tag));
    if (excluded !== undefined) {
      skipped.push({ file, reason: excludedTags[excluded] ?? excluded });
      continue;
    }
    const target = node.data.targets?.[burnInTarget];
    if (target === undefined) {
      skipped.push({ file, reason: `\`${project}\` has no \`${burnInTarget}\` target` });
      continue;
    }
    let filters: readonly string[];
    try {
      ({ filters } = resolveLauncher(target, {
        workspace,
        project: resolve(workspace, node.data.root),
        file,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ file, reason: `\`${project}:${burnInTarget}\`: ${message}` });
      continue;
    }
    // Vitest's file filters match as substrings of the file's path.
    if (
      filters.length > 0 &&
      !filters.some((filter) => resolve(workspace, file).includes(filter.replace(/^\.\//u, '')))
    ) {
      skipped.push({ file, reason: `\`${project}:${burnInTarget}\` names its files, and not this one` });
      continue;
    }
    byProject.set(project, [...(byProject.get(project) ?? []), file]);
  }
  const units = [...byProject.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([project, projectFiles]) => ({ project, target: burnInTarget, files: projectFiles }));
  return { units, skipped };
};

// ---------------------------------------------------------------------------------------------------------------
// Runs.

/**
 * The order of the runs: run-major, so run i of every unit comes before run i + 1 of any, and a cap that cuts the
 * schedule leaves every unit with as many runs as the others, give or take one.
 */
export const schedule = <T>(units: readonly T[], runs: number): Array<{ readonly unit: T; readonly run: number }> =>
  Array.from({ length: runs }, (_, run) => units.map((unit) => ({ unit, run }))).flat();

/** The seed of run `run` (0-based): `seed + run`, for every unit alike. */
export const runSeed = (seed: number, run: number): number => seed + run;

/** The parts of Vitest's `json` reporter output the burn-in reads. */
export type VitestFileReport = {
  readonly success?: boolean;
  readonly testResults?: ReadonlyArray<{
    readonly name: string;
    readonly status?: string;
    readonly message?: string;
    readonly assertionResults?: ReadonlyArray<{
      readonly fullName: string;
      readonly status: string;
      /** `null` in Vitest's output when there is none; read only through optional chaining. */
      readonly failureMessages?: readonly string[];
    }>;
  }>;
};

/**
 * - `passed` / `failed`: the file ran in this run.
 * - `error`: Vitest wrote no report, or the file is missing from it, or Vitest failed outside any test (an unhandled
 *   error). The system fails closed (D1, invariant 6): an error counts as a failure.
 * - `cut`: the cap ended the run before it finished; not counted.
 */
export type RunOutcome = 'passed' | 'failed' | 'error' | 'cut';

export type FileRun = { readonly outcome: RunOutcome; readonly message?: string };

/** One file's outcome in a run's report (absolute path, as Vitest names it). */
const fileOutcome = (report: VitestFileReport, absolute: string): FileRun => {
  const entry = report.testResults?.find((candidate) => candidate.name === absolute);
  if (!entry) {
    return { outcome: 'error', message: 'the report has no result for this file' };
  }
  const failed = entry.assertionResults?.find((test) => test.status === 'failed');
  if (failed) {
    return { outcome: 'failed', message: `${failed.fullName}: ${failed.failureMessages?.[0] ?? 'failed'}` };
  }
  if (entry.status === 'failed') {
    return { outcome: 'failed', message: entry.message ?? 'the file failed outside its tests' };
  }
  return { outcome: 'passed' };
};

/** Each file's outcome in one run of its unit. */
export const runOutcomes = (
  files: readonly string[],
  result: {
    /** The run's report, or undefined when Vitest wrote none. */
    readonly report: VitestFileReport | undefined;
    readonly exitCode: number | undefined;
    /** The cap killed the run. */
    readonly cut: boolean;
    /** Absolute path of a workspace-relative file, as Vitest names it. */
    readonly absolute: (file: string) => string;
  },
): Map<string, FileRun> => {
  const outcomes = new Map<string, FileRun>();
  for (const file of files) {
    if (result.cut) {
      outcomes.set(file, { outcome: 'cut' });
      continue;
    }
    outcomes.set(
      file,
      result.report
        ? fileOutcome(result.report, result.absolute(file))
        : { outcome: 'error', message: `Vitest exited ${result.exitCode ?? 'abnormally'} with no report` },
    );
  }
  // Vitest failed although no file did: an unhandled error, which cannot be attributed, so every file carries it.
  if (
    !result.cut &&
    result.report &&
    (result.exitCode ?? 0) !== 0 &&
    [...outcomes.values()].every((run) => run.outcome === 'passed')
  ) {
    for (const file of files) {
      outcomes.set(file, {
        outcome: 'error',
        message: `Vitest exited ${result.exitCode ?? 'abnormally'} with every test passed (an unhandled error)`,
      });
    }
  }
  return outcomes;
};

/** A failing run counts against the file. */
export const isRunFailure = (outcome: RunOutcome): boolean => outcome === 'failed' || outcome === 'error';

/** One burned-in file's result. */
export type FileRow = {
  readonly project: string;
  readonly target: string;
  readonly file: string;
  /** Runs that finished. */
  readonly runs: number;
  readonly planned: number;
  readonly failures: number;
  readonly seeds: readonly number[];
  readonly failingSeeds: readonly number[];
  /** The first failure's message, cut to 1,000 characters. */
  readonly firstFailure?: string;
  /** The cap ended the file's runs before all were done. */
  readonly cutShort: boolean;
};

/** A file's row from its runs, in run order. */
export const summarizeFile = (
  identity: { readonly project: string; readonly target: string; readonly file: string },
  runs: ReadonlyArray<FileRun & { readonly seed: number }>,
  planned: number,
): FileRow => {
  const finished = runs.filter((run) => run.outcome !== 'cut');
  const failed = finished.filter((run) => isRunFailure(run.outcome));
  const message = failed.find((run) => run.message !== undefined)?.message;
  return {
    ...identity,
    runs: finished.length,
    planned,
    failures: failed.length,
    seeds: finished.map((run) => run.seed),
    failingSeeds: failed.map((run) => run.seed),
    ...(message === undefined ? {} : { firstFailure: message.slice(0, 1000) }),
    cutShort: finished.length < planned,
  };
};

export type BurnInReport = {
  readonly schema: 'burn-in/1';
  readonly seed: number;
  readonly runs: number;
  readonly capMinutes: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** Wall minutes of the capped runs (preparation excluded). */
  readonly minutes: number;
  readonly rows: readonly FileRow[];
  /** Changed test files the target's own Vitest configuration does not collect. */
  readonly notCollected: readonly Skipped[];
  readonly failed: boolean;
  readonly cutShort: boolean;
};

const escapeCell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The Markdown job summary of a burn-in. */
export const renderSummary = (report: BurnInReport, skipped: readonly Skipped[] = []): string => {
  const failing = report.rows.filter((row) => row.failures > 0);
  const lines = [
    `## Burn-in: ${report.failed ? `${failing.length} of ${report.rows.length} files failed` : `${report.rows.length} files passed`}`,
    '',
    `${report.runs} runs per file with \`--sequence.shuffle\` and no retry, seeds ${report.seed}–${report.seed + report.runs - 1}, capped at ${report.capMinutes} min (took ${report.minutes.toFixed(1)} min)${report.cutShort ? '; **the cap cut some files short**' : ''}.`,
    '',
  ];
  if (report.rows.length > 0) {
    lines.push('| File | Target | Failed / runs | Failing seeds | First failure |', '| --- | --- | --- | --- | --- |');
    for (const row of report.rows) {
      lines.push(
        `| \`${row.file}\` | \`${row.project}:${row.target}\` | ${row.failures} / ${row.runs}${row.cutShort ? ` (cut short, ${row.planned} planned)` : ''} | ${row.failingSeeds.join(', ')} | ${row.firstFailure === undefined ? '' : escapeCell(row.firstFailure.slice(0, 200))} |`,
      );
    }
    lines.push('');
  }
  if (failing.length > 0) {
    lines.push(
      'A failing file is a flake or an order dependence this pull request brings: reproduce it with `--sequence.shuffle --sequence.seed=<seed>` and `--retry=0`, or dispatch `flake-repro.yml`; do not raise its retry.',
      '',
    );
  }
  const unrun = [...report.notCollected, ...skipped];
  if (unrun.length > 0) {
    lines.push(
      'Changed test files not burned in:',
      '',
      ...unrun.map(({ file, reason }) => `- \`${file}\`: ${reason}`),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
};
