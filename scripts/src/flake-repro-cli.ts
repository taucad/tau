/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names and GitHub REST JSON fields. */
/**
 * Flake reproduction under stress: the IO half (`flake-repro.ts` holds the logic). Brain
 * `research/ci-flake-quarantine-blueprint.md`, D7, FQ-7. `flake-repro.yml` runs it; it uses Node built-ins only, so
 * the workflow can run the copy from its own commit against any ref under test.
 *
 * `gate` validates the dispatch and admits it: fewer than three earlier runs of the workflow still going, and under
 * 3,000 runner-minutes of it in seven days. It appends the week's minutes to the job summary.
 *
 * `browsers` writes the Playwright browsers the target's Vitest command selects (`--project chromium`) to
 * `GITHUB_OUTPUT`, so the workflow installs them and their system dependencies (through `apt-install`) before `run`.
 *
 * `run` resolves the target's Vitest command from `nx show project`, builds the target's task dependencies once
 * (`nx run <dependency>`) and runs its other commands (a UI build), then runs the test in each variant of each mode
 * in fresh Vitest processes (`--retry=0`, the `json` reporter), dealing attempts round-robin across the variants
 * until each has `--attempts` or the deadline passes. A `shuffle` variant that failed is bisected to its polluter.
 * Writes `<out>/report.json`, one log and one Vitest report per attempt under `<out>/attempts/`, and the Markdown
 * summary to `--summary`.
 *
 * Usage:
 *   node scripts/src/flake-repro-cli.ts gate --modes repeat --attempts 20 --minutes 60 [--summary <file>]
 *   node scripts/src/flake-repro-cli.ts browsers --project <p> --target <t> --file <path> --test <name> [--command-index <n>]
 *   node scripts/src/flake-repro-cli.ts run --project <p> --target <t> --file <path> --test <full name>
 *     [--modes repeat,shuffle] [--attempts 20] [--seed 1] [--command-index <n>] [--deadline <epoch s>]
 *     [--out out/flake-repro] [--summary <file>] [--attempt-timeout 900] [--copies <n>] [--heap-mb 384]
 *     [--net-latency-ms 300] [--probe-seeds 6] [--ref <ref>] [--sha <sha>]
 * Env (gate): GITHUB_TOKEN (`actions: read`), GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_API_URL.
 * Exit codes: 0 report written, or admitted; 1 the run failed (no such test, an unsupported target, an API failure);
 * 2 usage; 3 not admitted.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, openSync, closeSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

import {
  admit,
  attemptPlan,
  browsersFor,
  dotenvFiles,
  findPolluter,
  isFailure,
  limits,
  namePattern,
  netPreloadSource,
  parseModes,
  pollutionUnits,
  renderSummary,
  resolveLauncher,
  summarizeRow,
  testOutcome,
  unavailable,
  variantKey,
} from '#flake-repro.js';
import type {
  Attempt,
  AttemptPlan,
  GateRun,
  Identity,
  Launcher,
  Outcome,
  PlanOptions,
  PolluterSearch,
  ProjectTarget,
  Report,
  Row,
  Variant,
  VitestJsonReport,
} from '#flake-repro.js';

/** A usage error: exit 2. */
class UsageError extends Error {}

const modesOf = (text: string | undefined) => {
  try {
    return parseModes(text ?? 'repeat');
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
};

const nonEmpty = (value: string | undefined): string | undefined => (value === '' ? undefined : value);

// `$` is a path character: React Router route directories (`w.$workspace.$project`) carry it. Names reach Vitest
// and Nx as arguments, never through a shell.
const safeName = /^[\w@.:/$-]+$/u;

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
// Attempts.

/** Everything one run needs to execute attempts. */
export type RunContext = {
  readonly root: string;
  readonly identity: Identity;
  readonly launcher: Launcher;
  /** The environment every attempt starts from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly vitest: string;
  readonly out: string;
  /** Epoch milliseconds after which no attempt starts. */
  readonly deadline: number;
  /** The longest one attempt may run. Milliseconds. */
  readonly attemptTimeout: number;
};

/** Kill a detached child's whole process group. */
export const killGroup = (child: ChildProcess): void => {
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
};

/** Busy-loop every core until the returned stop function is called. */
const stressCpus = (): (() => void) => {
  const loops = Array.from({ length: os.availableParallelism() }, () =>
    spawn(process.execPath, ['-e', 'for (;;) {}'], { stdio: 'ignore', detached: true }),
  );
  return () => {
    for (const loop of loops) {
      killGroup(loop);
    }
  };
};

/** Run one Vitest process and resolve its outcome for the target test. */
const runProcess = async (
  context: RunContext,
  plan: AttemptPlan,
  name: string,
): Promise<{ outcome: Outcome; message?: string; log: string }> => {
  const reportPath = resolve(context.out, 'attempts', `${name}.json`);
  const logPath = resolve(context.out, 'attempts', `${name}.log`);
  await rm(reportPath, { force: true });
  const argv = [
    ...plan.wrapper,
    context.vitest,
    ...context.launcher.args,
    '--run',
    '--retry=0',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportPath}`,
    ...plan.args,
  ];
  const nodeOptions = [context.env['NODE_OPTIONS'], ...plan.nodeOptions].filter(Boolean).join(' ');
  const env: Record<string, string | undefined> = { ...context.env, ...plan.env, NODE_OPTIONS: nodeOptions };
  if (!env['LD_PRELOAD']) {
    delete env['LD_PRELOAD'];
  }
  const log = openSync(logPath, 'w');
  const limit = Math.max(1000, Math.min(context.attemptTimeout, context.deadline - Date.now() + 60_000));
  const [command = '', ...rest] = argv;
  const { promise, resolve: settle } = Promise.withResolvers<boolean>();
  const child = spawn(command, rest, { cwd: context.launcher.cwd, env, stdio: ['ignore', log, log], detached: true });
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    killGroup(child);
  }, limit);
  const finish = (): void => {
    clearTimeout(timer);
    settle(expired);
  };
  child.on('error', finish);
  child.on('close', finish);
  const timedOut = await promise;
  closeSync(log);
  const logRelative = relative(context.root, logPath);
  if (timedOut) {
    return { outcome: 'timeout', message: `killed after ${Math.round(limit / 1000)} s`, log: logRelative };
  }
  let report: VitestJsonReport | undefined;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8')) as VitestJsonReport;
  } catch {
    report = undefined;
  }
  return { ...testOutcome(report, context.identity.file, context.identity.test), log: logRelative };
};

/** Run one attempt (all its copies) and record it. */
export const runAttempt = async (
  context: RunContext,
  { variant, index, plan }: { readonly variant: Variant; readonly index: number; readonly plan: AttemptPlan },
): Promise<Attempt> => {
  const started = Date.now();
  const stop = plan.cpuStress ? stressCpus() : undefined;
  const name = `${variant.mode}-${variant.variant}-${index}`;
  try {
    const copies = await Promise.all(
      Array.from({ length: plan.copies }, async (_, copy) =>
        runProcess(context, plan, plan.copies === 1 ? name : `${name}-copy${copy}`),
      ),
    );
    const failure = copies.find((copy) => isFailure(copy.outcome));
    const chosen = failure ?? copies.find((copy) => copy.outcome === 'missing') ?? copies[0];
    return {
      index,
      seed: plan.seed,
      outcome: chosen?.outcome ?? 'error',
      durationMs: Date.now() - started,
      ...(chosen?.message === undefined ? {} : { message: chosen.message }),
      ...(chosen?.log === undefined ? {} : { log: chosen.log }),
    };
  } finally {
    stop?.();
  }
};

/** Read the Vitest report an attempt wrote, for the polluter search's candidates. */
const attemptReport = async (out: string, variant: Variant, index: number): Promise<VitestJsonReport | undefined> => {
  try {
    const path = resolve(out, 'attempts', `${variant.mode}-${variant.variant}-${index}.json`);
    return JSON.parse(await readFile(path, 'utf8')) as VitestJsonReport;
  } catch {
    return undefined;
  }
};

/** Search for the polluter of a `shuffle` variant from its first failing attempt. */
const searchPolluter = async (
  context: RunContext,
  {
    variant,
    failing,
    probeSeeds,
  }: { readonly variant: Variant; readonly failing: Attempt; readonly probeSeeds: number },
): Promise<PolluterSearch> => {
  const scope = variant.variant === 'project' ? 'project' : 'file';
  const units = pollutionUnits(await attemptReport(context.out, variant, failing.index), {
    file: context.identity.file,
    test: context.identity.test,
    scope,
  });
  let probe = 0;
  return findPolluter(units, async (set) => {
    for (let offset = 0; offset < probeSeeds; offset++) {
      if (Date.now() >= context.deadline) {
        return undefined;
      }
      const seed = failing.seed + offset;
      const shuffle = ['--sequence.shuffle', `--sequence.seed=${seed}`];
      const args =
        scope === 'file'
          ? [context.identity.file, '--testNamePattern', namePattern([...set, context.identity.test]), ...shuffle]
          : ['--no-file-parallelism', ...set, context.identity.file, ...shuffle];
      const plan: AttemptPlan = {
        seed,
        args,
        env: { TAU_FLAKE_REPRO_SEED: String(seed), TAU_FLAKE_REPRO_ATTEMPT: String(failing.index) },
        nodeOptions: [],
        wrapper: [],
        copies: 1,
        cpuStress: false,
      };
      // oxlint-disable-next-line no-await-in-loop -- seeds are tried one at a time and the first failure ends the probe
      const result = await runProcess(context, plan, `${variant.mode}-${variant.variant}-probe${probe++}`);
      if (isFailure(result.outcome)) {
        return true;
      }
    }
    return false;
  });
};

/** Run every variant round-robin until each has its attempts or the deadline passes, then search for polluters. */
export const reproduce = async (
  context: RunContext,
  run: {
    readonly variants: readonly Variant[];
    readonly attempts: number;
    readonly options: PlanOptions & { readonly probeSeeds: number };
    readonly log?: (line: string) => void;
  },
): Promise<{ rows: Row[]; truncated: boolean }> => {
  const { variants, attempts, options } = run;
  const log =
    run.log ??
    ((line: string): void => {
      console.log(line);
    });
  await mkdir(resolve(context.out, 'attempts'), { recursive: true });
  if (variants.some((variant) => variant.mode === 'net')) {
    await writeFile(options.netPreload, netPreloadSource);
  }
  const runnable = variants.filter((variant) => !unavailable(variant, options));
  const recorded = new Map<string, Attempt[]>(runnable.map((variant) => [variantKey(variant), []]));
  // Attempts run one at a time: concurrent attempts would contend with each other and change what is measured.
  const schedule = Array.from({ length: attempts }, (_, index) =>
    runnable.map((variant) => ({ variant, index })),
  ).flat();
  let truncated = false;
  for (const { variant, index } of schedule) {
    if (Date.now() >= context.deadline) {
      truncated = true;
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
    const attempt = await runAttempt(context, { variant, index, plan: attemptPlan(variant, index, options) });
    recorded.get(variantKey(variant))?.push(attempt);
    log(
      `→ ${variantKey(variant)} #${index} seed ${attempt.seed}: ${attempt.outcome} (${(attempt.durationMs / 1000).toFixed(1)} s)`,
    );
    if (index === 0 && attempt.outcome === 'missing' && variant.mode === 'repeat') {
      throw new Error(
        `${context.identity.file} has no test named ${JSON.stringify(context.identity.test)} (see ${attempt.log ?? 'the log'})`,
      );
    }
  }
  const rows: Row[] = [];
  for (const variant of variants) {
    const reason = unavailable(variant, options);
    const done = recorded.get(variantKey(variant)) ?? [];
    let polluter: PolluterSearch | undefined;
    const failing = done.find((attempt) => isFailure(attempt.outcome));
    if (variant.mode === 'shuffle' && failing) {
      log(`→ ${variantKey(variant)}: searching for the polluter from seed ${failing.seed}`);
      // oxlint-disable-next-line no-await-in-loop -- one search at a time, for the same reason as the attempts
      polluter = await searchPolluter(context, { variant, failing, probeSeeds: options.probeSeeds });
      log(`✓ polluter: ${polluter.polluter ?? `not isolated (${polluter.note ?? ''})`}`);
    }
    rows.push(
      summarizeRow(variant, done, {
        planned: attempts,
        ...(reason === undefined ? {} : { unavailable: reason }),
        ...(polluter === undefined ? {} : { polluter }),
      }),
    );
  }
  return { rows, truncated };
};

// ---------------------------------------------------------------------------------------------------------------
// Resolving the target.

/** Run `pnpm` with the Nx daemon off; returns its stdout when `capture`. Throws on a non-zero exit. */
export const pnpm = (args: readonly string[], cwd: string, capture: boolean): string => {
  const result = spawnSync('pnpm', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NX_DAEMON: 'false' },
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} exited ${result.status ?? result.signal ?? 'abnormally'}`);
  }
  return capture ? result.stdout : '';
};

/** The JSON object in a command's output, skipping lines a dotenv loader printed before it. */
export const jsonFrom = (text: string): unknown => JSON.parse(text.slice(text.search(/^[{[]/mu)));

/** The environment Nx gives the target: dotenv files of the project, then the workspace, never over the process's. */
export const targetEnvironment = ({
  root,
  projectRoot,
  target,
  launcher,
}: {
  root: string;
  projectRoot: string;
  target: string;
  launcher: Launcher;
}): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const directory of [projectRoot, root]) {
    for (const name of dotenvFiles(target)) {
      const path = resolve(directory, name);
      if (existsSync(path)) {
        for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
          env[key] ??= value;
        }
      }
    }
  }
  return { ...env, ...launcher.env };
};

/** Build the target's task dependencies and run its non-Vitest commands once, before any attempt. */
export const prepare = ({
  root,
  identity,
  launcher,
  env,
  graphPath = resolve(root, 'out/flake-repro/task-graph.json'),
}: {
  root: string;
  identity: Pick<Identity, 'project' | 'target'>;
  launcher: Launcher;
  env: Record<string, string | undefined>;
  /** Where `nx run --graph` writes the target's task graph. */
  graphPath?: string;
}): void => {
  pnpm(['nx', 'run', `${identity.project}:${identity.target}`, `--graph=${graphPath}`], root, true);
  const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as {
    tasks?: { dependencies?: Record<string, string[]> };
  };
  for (const task of graph.tasks?.dependencies?.[`${identity.project}:${identity.target}`] ?? []) {
    console.log(`→ prepare: nx run ${task}`);
    pnpm(['nx', 'run', task, '--outputStyle=static'], root, false);
  }
  for (const command of launcher.prepare) {
    console.log(`→ prepare: ${command}`);
    const result = spawnSync('bash', ['-c', command], { cwd: launcher.cwd, env, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`prepare command \`${command}\` exited ${result.status ?? 'abnormally'}`);
    }
  }
};

const faketimeLibraries = [
  '/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1',
  '/usr/lib/aarch64-linux-gnu/faketime/libfaketime.so.1',
  '/usr/local/lib/faketime/libfaketime.so.1',
];

const onPath = (command: string): boolean => spawnSync('sh', ['-c', `command -v ${command}`]).status === 0;

const environment = (root: string): Record<string, string | number | undefined> => {
  let vitest: string | undefined;
  try {
    vitest = (
      JSON.parse(readFileSync(resolve(root, 'node_modules/vitest/package.json'), 'utf8')) as { version: string }
    ).version;
  } catch {
    vitest = undefined;
  }
  return {
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpus: os.availableParallelism(),
    cpuModel: os.cpus()[0]?.model,
    memoryMb: Math.round(os.totalmem() / 2 ** 20),
    node: process.version,
    vitest,
    runner: process.env['RUNNER_NAME'],
    image: process.env['ImageOS'] && `${process.env['ImageOS']} ${process.env['ImageVersion'] ?? ''}`.trim(),
    runId: process.env['GITHUB_RUN_ID'],
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

/** The identity, the target's project root and its launcher, from the options and `nx show project`. */
const resolveTarget = (
  values: Record<string, string | undefined>,
): { root: string; identity: Identity; file: string; projectRoot: string; launcher: Launcher } => {
  const root = process.cwd();
  const required = (name: string): string => {
    const value = values[name];
    if (!value) {
      throw new UsageError(`--${name} is required`);
    }
    return value;
  };
  const identity: Identity = {
    project: required('project'),
    target: required('target'),
    file: required('file'),
    test: required('test'),
  };
  for (const name of ['project', 'target', 'file'] as const) {
    if (!safeName.test(identity[name]) || identity[name].includes('..')) {
      throw new UsageError(`--${name} has characters outside [A-Za-z0-9_@.:/$-]: ${identity[name]}`);
    }
  }
  const file = resolve(root, identity.file);
  if (!existsSync(file)) {
    throw new UsageError(`--file ${identity.file} does not exist at this ref`);
  }
  const commandIndex = values['command-index']
    ? integer(values['command-index'], { name: 'command-index', minimum: 0, maximum: 99, fallback: 0 })
    : undefined;
  const project = jsonFrom(pnpm(['nx', 'show', 'project', identity.project, '--json'], root, true)) as {
    root: string;
    targets?: Record<string, ProjectTarget>;
  };
  const target = project.targets?.[identity.target];
  if (!target) {
    throw new Error(`${identity.project} has no target ${identity.target}`);
  }
  const projectRoot = resolve(root, project.root);
  const launcher = resolveLauncher(target, {
    workspace: root,
    project: projectRoot,
    file: identity.file,
    ...(commandIndex === undefined ? {} : { commandIndex }),
  });
  return { root, identity, file, projectRoot, launcher };
};

/** `browsers`: the Playwright browsers the target selects, as `browsers=<list>` in `GITHUB_OUTPUT` (or stdout). */
const browsersCommand = async (values: Record<string, string | undefined>): Promise<number> => {
  const line = `browsers=${browsersFor(resolveTarget(values).launcher).join(' ')}\n`;
  const output = process.env['GITHUB_OUTPUT'];
  if (output) {
    await appendFile(output, line);
  } else {
    process.stdout.write(line);
  }
  return 0;
};

const runCommand = async (values: Record<string, string | undefined>): Promise<number> => {
  const variants = modesOf(values['modes']);
  const attempts = integer(values['attempts'], { name: 'attempts', minimum: 1, maximum: 2000, fallback: 20 });
  const seed = integer(values['seed'], { name: 'seed', minimum: 0, maximum: 2 ** 31, fallback: 1 });
  const { root, identity, file, projectRoot, launcher } = resolveTarget(values);
  const out = resolve(root, values['out'] ?? 'out/flake-repro');
  const deadline = values['deadline']
    ? integer(values['deadline'], { name: 'deadline', minimum: 0, maximum: 2 ** 40, fallback: 0 }) * 1000
    : Date.now() + 60 * 60_000;
  const startedAt = new Date();
  const env = targetEnvironment({ root, projectRoot, target: identity.target, launcher });
  await mkdir(out, { recursive: true });
  prepare({ root, identity, launcher, env });

  const faketimeLibrary = [process.env['FAKETIME_LIB'], ...faketimeLibraries].find((path) => path && existsSync(path));
  const options = {
    seed,
    file,
    test: identity.test,
    copies: integer(values['copies'], {
      name: 'copies',
      minimum: 2,
      maximum: 64,
      fallback: Math.max(2, os.availableParallelism()),
    }),
    faketimeLibrary,
    taskset: onPath('taskset'),
    netPreload: resolve(out, 'net-preload.mjs'),
    netLatency: integer(values['net-latency-ms'], {
      name: 'net-latency-ms',
      minimum: 0,
      maximum: 60_000,
      fallback: 300,
    }),
    heapMb: integer(values['heap-mb'], { name: 'heap-mb', minimum: 16, maximum: 16_384, fallback: 384 }),
    year: startedAt.getUTCFullYear(),
    projectFilters: launcher.filters,
    probeSeeds: integer(values['probe-seeds'], { name: 'probe-seeds', minimum: 1, maximum: 64, fallback: 6 }),
  };
  const context: RunContext = {
    root,
    identity: { ...identity, file },
    launcher,
    env,
    vitest: resolve(root, 'node_modules/.bin/vitest'),
    out,
    deadline,
    attemptTimeout:
      integer(values['attempt-timeout'], { name: 'attempt-timeout', minimum: 10, maximum: 7200, fallback: 900 }) * 1000,
  };
  const { rows, truncated } = await reproduce(context, { variants, attempts, options });
  const finishedAt = new Date();
  const report: Report = {
    schema: 'flake-repro/1',
    identity,
    ref: nonEmpty(values['ref']),
    sha: nonEmpty(values['sha']),
    seed,
    attemptsPerVariant: attempts,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    minutes: (finishedAt.getTime() - startedAt.getTime()) / 60_000,
    launcher: {
      cwd: relative(root, launcher.cwd) || '.',
      command: ['vitest', ...launcher.args],
      prepare: launcher.prepare,
    },
    environment: environment(root),
    rows,
    verdict: rows.some((row) => row.failures > 0) ? 'reproduced' : 'not-reproduced',
    truncated,
  };
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  const summary = renderSummary(report);
  if (values['summary']) {
    await appendFile(values['summary'], summary);
  }
  console.log(summary);
  return 0;
};

// ---------------------------------------------------------------------------------------------------------------
// The gate.

const gateCommand = async (values: Record<string, string | undefined>): Promise<number> => {
  modesOf(values['modes']);
  integer(values['attempts'], { name: 'attempts', minimum: 1, maximum: 2000, fallback: 20 });
  integer(values['minutes'], { name: 'minutes', minimum: 5, maximum: limits.dispatchMinutes, fallback: 60 });
  const token = process.env['GITHUB_TOKEN'];
  const repository = process.env['GITHUB_REPOSITORY'];
  const self = Number(process.env['GITHUB_RUN_ID']);
  if (!token || !repository || !Number.isInteger(self)) {
    throw new UsageError('GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID are required');
  }
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const workflow = values['workflow'] ?? 'flake-repro.yml';
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
  const runs: GateRun[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${api}/repos/${repository}/actions/workflows/${workflow}/runs?per_page=100&page=${page}&created=${encodeURIComponent(`>=${since}`)}`;
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until a short one
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} answered ${response.status}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const body = (await response.json()) as { workflow_runs: GateRun[] };
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < 100) {
      break;
    }
  }
  const decision = admit(runs, self, now);
  const summary = [
    `### Flake reproduction gate: ${decision.admitted ? 'admitted' : 'refused'}`,
    '',
    `- Runner-minutes of \`${workflow}\` in the last 7 days, before this run: ${Math.round(decision.weekMinutes)} of ${limits.weeklyMinutes}`,
    `- Earlier runs still going: ${decision.ahead.length} of ${limits.concurrent}`,
    ...(decision.admitted ? [] : [`- Refused: ${decision.reason}`]),
    '',
  ].join('\n');
  if (values['summary']) {
    await appendFile(values['summary'], summary);
  }
  console.log(summary);
  if (process.env['GITHUB_OUTPUT']) {
    await appendFile(process.env['GITHUB_OUTPUT'], `week-minutes=${Math.round(decision.weekMinutes)}\n`);
  }
  if (!decision.admitted) {
    console.error(`::error title=Flake reproduction refused::${decision.reason}`);
    return 3;
  }
  return 0;
};

const main = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(
      [
        'project',
        'target',
        'file',
        'test',
        'modes',
        'attempts',
        'seed',
        'command-index',
        'deadline',
        'out',
        'summary',
        'attempt-timeout',
        'copies',
        'heap-mb',
        'net-latency-ms',
        'probe-seeds',
        'ref',
        'sha',
        'minutes',
        'workflow',
      ].map((name) => [name, { type: 'string' }] as const),
    ),
  });
  const [command] = positionals;
  const strings = values as Record<string, string | undefined>;
  if (command === 'gate') {
    return gateCommand(strings);
  }
  if (command === 'run') {
    return runCommand(strings);
  }
  if (command === 'browsers') {
    return browsersCommand(strings);
  }
  throw new UsageError('usage: flake-repro-cli.ts gate|browsers|run [options] (see the file header)');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`flake-repro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
