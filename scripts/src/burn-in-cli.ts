/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
/**
 * Burn-in of changed tests on pull requests: the IO half (`burn-in.ts` holds the logic). Brain
 * `research/ci-flake-quarantine-blueprint.md`, FQ-10 and operator decision O6 (B). `ci.yml` runs it.
 *
 * `plan` reads the pull request's added and modified files (one per line on stdin) and the project graph
 * (`nx graph --file`), maps each changed test file to its project's `test` target, and writes `burn-in=true|false` and
 * `burn-in-units=<json>` to `GITHUB_OUTPUT`, and the files it leaves out, with the reason, to the summary.
 *
 * `run` takes those units, builds each target's task dependencies once (as `flake-repro.yml` does), drops the files
 * the target's Vitest configuration does not collect (`vitest list`), then runs each unit's files `--runs` times in
 * fresh Vitest processes with `--sequence.shuffle --sequence.seed=<seed + run>` and `--retry=0`, run-major, until
 * every unit has its runs or `--minutes` of wall time have passed: the cap kills the run in progress and starts no
 * other, and the files it cut short are reported as such. Each run also gets `TAU_BURN_IN_SEED` and
 * `TAU_FLAKE_REPRO_SEED` (the seed the FQ-7 fixtures read). Writes `<out>/report.json`, one log and one Vitest report
 * per run under `<out>/runs/`, the Markdown summary to `--summary`, and an error annotation per failing file.
 *
 * Usage:
 *   git diff --name-only --diff-filter=AM … | node scripts/src/burn-in-cli.ts plan --graph <file> [--summary <file>]
 *   node scripts/src/burn-in-cli.ts run --units '<json>' [--runs 10] [--minutes 5] [--seed 1] [--out out/burn-in]
 *     [--summary <file>]
 * Exit codes: 0 planned, or every burned-in file passed every run it finished; 1 a file failed a run, or the run
 * could not start (an unknown target, a failed preparation); 2 usage.
 */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { jsonFrom, killGroup, pnpm, prepare, targetEnvironment } from '#flake-repro-cli.js';
import { resolveLauncher } from '#flake-repro.js';
import type { Launcher, ProjectTarget } from '#flake-repro.js';
import {
  burnIn,
  isRunFailure,
  planBurnIn,
  renderSummary,
  runOutcomes,
  runSeed,
  schedule,
  summarizeFile,
} from '#burn-in.js';
import type { BurnInReport, BurnInUnit, FileRow, FileRun, GraphNodes, Skipped, VitestFileReport } from '#burn-in.js';

/** A usage error: exit 2. */
class UsageError extends Error {}

const integer = (
  value: string | undefined,
  { name, minimum, maximum, fallback }: { name: string; minimum: number; maximum: number; fallback: number },
): number => {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new UsageError(`--${name} must be an integer from ${minimum} to ${maximum}, got ${value}`);
  }
  return parsed;
};

// ---------------------------------------------------------------------------------------------------------------
// Runs.

/** One unit ready to run: its launcher, environment and the files its configuration collects (absolute). */
export type ReadyUnit = {
  readonly project: string;
  readonly target: string;
  readonly launcher: Launcher;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Workspace-relative files, and their absolute paths as Vitest names them. */
  readonly files: ReadonlyArray<{ readonly file: string; readonly absolute: string }>;
};

/** Spawn one process in its own group, log to `log`, kill it after `killAfter` milliseconds. Resolves its exit code. */
const runLogged = async (
  argv: readonly string[],
  {
    cwd,
    env,
    log,
    killAfter,
  }: {
    cwd: string;
    env: Record<string, string | undefined>;
    log: string;
    /** Milliseconds. */
    killAfter: number;
  },
): Promise<{ readonly exitCode: number | undefined; readonly timedOut: boolean }> => {
  const descriptor = openSync(log, 'w');
  const [command = '', ...rest] = argv;
  const { promise, resolve: settle } = Promise.withResolvers<number | undefined>();
  const child = spawn(command, rest, { cwd, env, stdio: ['ignore', descriptor, descriptor], detached: true });
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      killGroup(child);
    },
    Math.max(0, killAfter),
  );
  child.on('error', () => {
    settle(undefined);
  });
  child.on('close', (code) => {
    settle(code ?? undefined);
  });
  const exitCode = await promise;
  clearTimeout(timer);
  closeSync(descriptor);
  return { exitCode, timedOut };
};

const readReport = async (path: string): Promise<VitestFileReport | undefined> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as VitestFileReport;
  } catch {
    return undefined;
  }
};

/**
 * Run every unit `runs` times, run-major, until done or `deadline` (epoch ms). Each run is a fresh Vitest process
 * over the unit's files with shuffle on its own seed and no retry; the run in progress at the deadline is killed and
 * its files are cut short.
 */
export const runBurnIn = async (
  units: readonly ReadyUnit[],
  options: {
    readonly vitest: string;
    readonly out: string;
    readonly runs: number;
    readonly seed: number;
    readonly deadline: number;
    readonly log?: (line: string) => void;
  },
): Promise<{ readonly rows: FileRow[]; readonly truncated: boolean }> => {
  const log =
    options.log ??
    ((line: string): void => {
      console.log(line);
    });
  await mkdir(resolve(options.out, 'runs'), { recursive: true });
  const recorded = new Map<string, Array<FileRun & { seed: number }>>();
  let truncated = false;
  for (const { unit, run } of schedule(units, options.runs)) {
    const seed = runSeed(options.seed, run);
    const name = `${unit.project}-${unit.target}-${run}`.replaceAll(/[^\w.-]/gu, '-');
    const reportPath = resolve(options.out, 'runs', `${name}.json`);
    const remaining = options.deadline - Date.now();
    let result: { exitCode: number | undefined; timedOut: boolean } = { exitCode: undefined, timedOut: true };
    if (remaining > 0) {
      // oxlint-disable-next-line no-await-in-loop -- runs are sequential: concurrent runs would contend and change what is measured
      await rm(reportPath, { force: true });
      // oxlint-disable-next-line no-await-in-loop -- as above
      result = await runLogged(
        [
          options.vitest,
          ...unit.launcher.args,
          '--run',
          '--retry=0',
          '--sequence.shuffle',
          `--sequence.seed=${seed}`,
          '--reporter=default',
          '--reporter=json',
          `--outputFile.json=${reportPath}`,
          ...unit.files.map(({ absolute }) => absolute),
        ],
        {
          cwd: unit.launcher.cwd,
          env: {
            ...unit.env,
            TAU_BURN_IN_SEED: String(seed),
            TAU_BURN_IN_RUN: String(run),
            TAU_FLAKE_REPRO_SEED: String(seed),
          },
          log: resolve(options.out, 'runs', `${name}.log`),
          killAfter: remaining,
        },
      );
    }
    truncated ||= result.timedOut;
    const byPath = new Map(unit.files.map(({ file, absolute }) => [file, absolute]));
    const outcomes = runOutcomes(
      unit.files.map(({ file }) => file),
      {
        // oxlint-disable-next-line no-await-in-loop -- as above
        report: result.timedOut ? undefined : await readReport(reportPath),
        exitCode: result.exitCode,
        cut: result.timedOut,
        absolute: (file) => byPath.get(file) ?? file,
      },
    );
    for (const [file, outcome] of outcomes) {
      const key = `${unit.project}\0${unit.target}\0${file}`;
      recorded.set(key, [...(recorded.get(key) ?? []), { ...outcome, seed }]);
    }
    const failed = [...outcomes.values()].filter((outcome) => isRunFailure(outcome.outcome)).length;
    log(
      result.timedOut
        ? `→ ${unit.project}:${unit.target} run ${run + 1} seed ${seed}: cut short by the cap`
        : `→ ${unit.project}:${unit.target} run ${run + 1} seed ${seed}: ${failed} of ${outcomes.size} files failed`,
    );
  }
  const rows = units.flatMap((unit) =>
    unit.files.map(({ file }) =>
      summarizeFile(
        { project: unit.project, target: unit.target, file },
        recorded.get(`${unit.project}\0${unit.target}\0${file}`) ?? [],
        options.runs,
      ),
    ),
  );
  return { rows, truncated: truncated || rows.some((row) => row.cutShort) };
};

/** The files of `files` (absolute) that `vitest list` collects under the launcher's configuration. */
export const collected = (
  launcher: Launcher,
  {
    vitest,
    files,
    env,
    out,
  }: { vitest: string; files: readonly string[]; env: Record<string, string | undefined>; out: string },
): Set<string> => {
  const listPath = resolve(out, 'list.json');
  const result = spawnSync(vitest, ['list', ...launcher.args, '--filesOnly', `--json=${listPath}`, ...files], {
    cwd: launcher.cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `vitest list exited ${result.status ?? result.signal ?? 'abnormally'}: ${result.stderr.slice(-2000)}`,
    );
  }
  const listed = JSON.parse(readFileSync(listPath, 'utf8')) as ReadonlyArray<{ readonly file: string }>;
  return new Set(listed.map((entry) => entry.file));
};

// ---------------------------------------------------------------------------------------------------------------
// Commands.

const output = async (lines: readonly string[]): Promise<void> => {
  const text = lines.map((line) => `${line}\n`).join('');
  const path = process.env['GITHUB_OUTPUT'];
  if (path) {
    await appendFile(path, text);
  } else {
    process.stdout.write(text);
  }
};

const planCommand = async (values: Record<string, string | undefined>): Promise<number> => {
  const graphPath = values['graph'];
  if (!graphPath) {
    throw new UsageError('--graph is required');
  }
  const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as { graph: { nodes: GraphNodes } };
  const input = await text(process.stdin);
  const files = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const { units, skipped } = planBurnIn(files, graph.graph.nodes, process.cwd());
  for (const unit of units) {
    console.log(`Burn-in ${unit.project}:${unit.target}: ${unit.files.join(', ')}`);
  }
  for (const { file, reason } of skipped) {
    console.log(`Not burned in: ${file} (${reason})`);
  }
  if (units.length === 0) {
    console.log('No changed test file to burn in: no burn-in job.');
  }
  if (values['summary'] && skipped.length > 0) {
    await appendFile(
      values['summary'],
      [
        '### Burn-in plan',
        '',
        'Changed test files not burned in:',
        '',
        ...skipped.map(({ file, reason }) => `- \`${file}\`: ${reason}`),
        '',
        '',
      ].join('\n'),
    );
  }
  await output([`burn-in=${units.length > 0}`, `burn-in-units=${JSON.stringify(units)}`]);
  return 0;
};

/**
 * The burn-in units the plan wrote. Names are limited to path characters; `$` is one, since React Router route
 * directories (`w.$workspace.$project`) carry it and every name reaches Vitest as an argument, never through a shell.
 *
 * @param text - The plan's `burn-in-units` JSON.
 * @returns The units.
 */
export const parseUnits = (text: string | undefined): BurnInUnit[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? '');
  } catch {
    throw new UsageError('--units must be the JSON the plan wrote');
  }
  const units = Array.isArray(parsed) ? (parsed as BurnInUnit[]) : [];
  const safe = /^[\w@.:/$-]+$/u;
  for (const unit of units) {
    for (const value of [unit.project, unit.target, ...unit.files]) {
      if (typeof value !== 'string' || !safe.test(value) || value.includes('..')) {
        throw new UsageError(`--units names ${JSON.stringify(value)}, outside [A-Za-z0-9_@.:/$-]`);
      }
    }
  }
  return units;
};

const runCommand = async (values: Record<string, string | undefined>): Promise<number> => {
  const units = parseUnits(values['units']);
  const runs = integer(values['runs'], { name: 'runs', minimum: 1, maximum: 100, fallback: burnIn.runs });
  const minutes = integer(values['minutes'], { name: 'minutes', minimum: 1, maximum: 60, fallback: burnIn.minutes });
  const seed = integer(values['seed'], { name: 'seed', minimum: 0, maximum: 2 ** 31, fallback: 1 });
  const root = process.cwd();
  const out = resolve(root, values['out'] ?? 'out/burn-in');
  const vitest = resolve(root, 'node_modules/.bin/vitest');
  await mkdir(out, { recursive: true });

  const ready: ReadyUnit[] = [];
  const notCollected: Skipped[] = [];
  for (const unit of units) {
    const project = jsonFrom(pnpm(['nx', 'show', 'project', unit.project, '--json'], root, true)) as {
      root: string;
      targets?: Record<string, ProjectTarget>;
    };
    const target = project.targets?.[unit.target];
    if (!target) {
      throw new Error(`${unit.project} has no target ${unit.target}`);
    }
    const projectRoot = resolve(root, project.root);
    const launcher = resolveLauncher(target, { workspace: root, project: projectRoot, file: unit.files[0] ?? '' });
    const env = targetEnvironment({ root, projectRoot, target: unit.target, launcher });
    console.log(`→ prepare ${unit.project}:${unit.target}`);
    prepare({ root, identity: unit, launcher, env, graphPath: resolve(out, `${unit.project}-task-graph.json`) });
    const files = unit.files.map((file) => ({ file, absolute: resolve(root, file) }));
    const listed = collected(launcher, { vitest, files: files.map(({ absolute }) => absolute), env, out });
    for (const { file, absolute } of files) {
      if (!listed.has(absolute)) {
        notCollected.push({
          file,
          reason: `\`${unit.project}:${unit.target}\`'s Vitest configuration does not collect it`,
        });
      }
    }
    const kept = files.filter(({ absolute }) => listed.has(absolute));
    if (kept.length > 0) {
      ready.push({ project: unit.project, target: unit.target, launcher, env, files: kept });
    }
  }

  const startedAt = new Date();
  const { rows, truncated } = await runBurnIn(ready, {
    vitest,
    out,
    runs,
    seed,
    deadline: startedAt.getTime() + minutes * 60_000,
  });
  const finishedAt = new Date();
  const report: BurnInReport = {
    schema: 'burn-in/1',
    seed,
    runs,
    capMinutes: minutes,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    minutes: (finishedAt.getTime() - startedAt.getTime()) / 60_000,
    rows,
    notCollected,
    failed: rows.some((row) => row.failures > 0),
    cutShort: truncated,
  };
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  const summary = renderSummary(report);
  if (values['summary']) {
    await appendFile(values['summary'], summary);
  }
  console.log(summary);
  for (const row of rows) {
    if (row.failures > 0) {
      console.log(
        `::error file=${row.file},title=Burn-in failed::${row.failures} of ${row.runs} shuffled runs failed (seeds ${row.failingSeeds.join(', ')}); ${(row.firstFailure ?? '').replaceAll(/\s+/gu, ' ').slice(0, 300)}`,
      );
    } else if (row.cutShort) {
      console.log(
        `::warning file=${row.file},title=Burn-in cut short::${row.runs} of ${row.planned} runs finished inside the ${minutes}-minute cap`,
      );
    }
  }
  console.log(`Report: ${relative(root, resolve(out, 'report.json'))}`);
  return report.failed ? 1 : 0;
};

const main = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      ['graph', 'summary', 'units', 'runs', 'minutes', 'seed', 'out'].map(
        (name) => [name, { type: 'string' }] as const,
      ),
    ),
  });
  const [command] = positionals;
  const strings = values as Record<string, string | undefined>;
  if (command === 'plan') {
    return planCommand(strings);
  }
  if (command === 'run') {
    return runCommand(strings);
  }
  throw new UsageError('usage: burn-in-cli.ts plan|run [options] (see the file header)');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`burn-in: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
