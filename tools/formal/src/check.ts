import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Expectation, ExpectedLocation, Outcome, Tier } from '#expected.js';
import { compareOutcome, describeOutcome, findExpectedFiles, lintExpectedFile } from '#expected.js';
import { exportGraph, generatedFiles, simulateBehaviours, staleFiles } from '#export.js';
import { checkLean, leanMutantChecker } from '#lean.js';
import { findMutantFiles, runMutants } from '#mutants.js';
import { sanitizeLog } from '#sanitize.js';
import type { JavaResult } from '#tlc.js';
import { compressTrace, runApalacheCase, runJava, runTlcCase, sanyCommand } from '#tlc.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory, locateTools, missingTools } from '#toolchain.js';

export type RunRecord = {
  readonly name: string;
  readonly expected?: string;
  readonly actual: string;
  readonly seconds: number;
  readonly ok: boolean;
};

export type CheckReport = { readonly records: readonly RunRecord[]; readonly failures: readonly string[] };

type JavaTools = Required<Pick<LocatedTools, 'java' | 'tlc'>>;

type Job = {
  readonly name: string;
  readonly expectation?: Expectation;
  readonly run: () => Promise<{ readonly outcome: Outcome; readonly result: JavaResult }>;
};

const watchdogSeconds = (tier: Tier): number => (tier === 'pr' ? 300 : 900);

const moduleOfConfig = (config: string): string => `${config.split('.')[0] ?? config}.tla`;

/** Plans every SANY, config and log run of one `specs/` directory for a tier. */
const planDirectory = (
  context: FormalContext,
  {
    location,
    tier,
    tools,
    projectRoot,
  }: {
    readonly location: ExpectedLocation;
    readonly tier: Tier;
    readonly tools: JavaTools & Pick<LocatedTools, 'apalache'>;
    readonly projectRoot: string;
  },
): { readonly jobs: readonly Job[]; readonly problems: readonly string[] } => {
  const { directory, file } = location;
  const relative = path.relative(context.root, directory);
  const env = { ...context.env, FORMAL_PROJECT_ROOT: projectRoot }; // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
  const timeoutSeconds = watchdogSeconds(tier);
  const problems = lintExpectedFile(file).map((problem) => `${relative}: ${problem}`);
  const entries = readdirSync(directory);
  const configs = file.configs ?? {};
  for (const config of entries.filter((entry) => entry.endsWith('.cfg'))) {
    const tracedBy = Object.keys(file.logs ?? {}).some((spec) => config === `${spec}.validate.cfg`);
    if (!(config in configs) && !tracedBy) {
      problems.push(`${relative}/${config}: no expectation in expected.json`);
    }
  }
  for (const config of Object.keys(configs)) {
    if (!entries.includes(config)) {
      problems.push(`${relative}/${config}: expected.json names a config that does not exist`);
    }
  }

  type TlcJob = {
    readonly config: string;
    readonly module: string;
    readonly traceFile?: string;
    readonly prepare?: () => void;
  };
  const tlcJob = (name: string, expectation: Expectation | undefined, run: TlcJob): Job => ({
    name,
    ...(expectation ? { expectation } : {}),
    run: async () => {
      run.prepare?.();
      return runTlcCase(context, {
        tools,
        directory,
        module: run.module,
        config: run.config,
        env,
        timeoutSeconds,
        ...(run.traceFile ? { traceFile: run.traceFile } : {}),
      });
    },
  });

  const sany: Job[] =
    tier === 'pr'
      ? entries
          .filter((entry) => entry.endsWith('.tla'))
          .map((module) => ({
            name: `${relative}/${module} (SANY)`,
            run: async () => {
              const result = await runJava({
                ...sanyCommand(tools, path.join(directory, module)),
                cwd: directory,
                env,
                timeoutSeconds,
              });
              const failed = /\*\*\* errors?:|fatal errors|parse error|could not parse/i.test(result.output);
              return {
                outcome: failed
                  ? { error: result.output.split('\n').find((line) => /error/i.test(line)) ?? 'SANY failed' }
                  : 'pass',
                result,
              };
            },
          }))
      : [];

  const configJobs = Object.entries(configs)
    .filter(([, expectation]) => expectation.tier === tier)
    .map(([config, expectation]) =>
      tlcJob(`${relative}/${config}`, expectation, { config, module: moduleOfConfig(config) }),
    );

  const logJobs = Object.entries(file.logs ?? {}).flatMap(([spec, logs]) =>
    Object.entries(logs)
      .filter(([, expectation]) => expectation.tier === tier)
      .map(([log, expectation]) => {
        const traceFile = path.join(cacheDirectory(context), 'logs', relative, log);
        return tlcJob(`${relative}/${log} (${spec})`, expectation, {
          config: `${spec}.validate.cfg`,
          module: `${spec}.tla`,
          traceFile,
          prepare: () => {
            sanitizeLog(path.join(directory, log), traceFile);
          },
        });
      }),
  );

  const graphJobs: Job[] =
    tier === 'pr'
      ? Object.entries(file.graphs ?? {}).map(([module, graph]) => ({
          name: `${relative}/${module} (graph and suite)`,
          run: async () => {
            const exported = await exportGraph(context, { tools, directory, module, ...graph });
            const stale = staleFiles(generatedFiles(directory, module, exported)).map((stalePath) =>
              path.relative(directory, stalePath),
            );
            const outcome: Outcome =
              exported.outcome === 'pass'
                ? stale.length > 0
                  ? { error: `stale ${stale.join(', ')}: run formal update` }
                  : 'pass'
                : exported.outcome;
            return { outcome, result: { output: '', seconds: exported.seconds, killed: false } };
          },
        }))
      : [];

  const { apalache } = tools;
  const apalacheJobs: Job[] = (file.apalache ?? [])
    .filter((entry) => entry.tier === tier)
    .map((entry) => ({
      name: `${relative} apalache ${entry.args.join(' ')}`,
      expectation: entry,
      run: async () =>
        apalache
          ? runApalacheCase(context, {
              tools: { java: tools.java, apalache },
              directory,
              args: entry.args,
              timeoutSeconds,
            })
          : { outcome: { error: 'apalache not found' }, result: { output: '', seconds: 0, killed: false } },
    }));

  return { jobs: [...sany, ...configJobs, ...graphJobs, ...logJobs, ...apalacheJobs], problems };
};

const runJobs = async (
  jobs: readonly Job[],
  log: (line: string) => void,
): Promise<{ records: RunRecord[]; failures: string[] }> => {
  const results = await Promise.all(
    jobs.map(async (job) => {
      const { outcome, result } = await job.run();
      const mismatch = job.expectation
        ? compareOutcome(job.expectation, outcome)
        : typeof outcome === 'object' && 'error' in outcome
          ? describeOutcome(outcome)
          : undefined;
      const record: RunRecord = {
        name: job.name,
        ...(job.expectation ? { expected: describeOutcome(job.expectation.expect) } : {}),
        actual: describeOutcome(outcome),
        seconds: Math.round(result.seconds * 100) / 100,
        ok: mismatch === undefined,
      };
      log(`${record.ok ? 'ok  ' : 'FAIL'} ${job.name}: ${record.actual} (${record.seconds}s)`);
      if (mismatch) {
        log(`     ${mismatch}`);
        for (const line of compressTrace(result.output).slice(0, 40)) {
          log(`     ${line}`);
        }
      }
      return { record, failure: mismatch ? `${job.name}: ${mismatch}` : undefined };
    }),
  );
  return {
    records: results.map((entry) => entry.record),
    failures: results.flatMap((entry) => (entry.failure ? [entry.failure] : [])),
  };
};

export const writeSummary = (
  context: FormalContext,
  { projectRoot, tier }: { readonly projectRoot: string; readonly tier: string },
  report: CheckReport,
): string => {
  const directory = path.join(context.root, 'out/reports/formal', path.relative(context.root, projectRoot), tier);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'summary.json');
  const seconds = report.records.reduce((total, record) => total + record.seconds, 0);
  writeFileSync(
    file,
    `${JSON.stringify({ tier, seconds: Math.round(seconds * 100) / 100, failures: report.failures, runs: report.records }, undefined, 2)}\n`,
  );
  return file;
};

export type CheckOptions = {
  readonly tier: Tier | 'lean';
  /** Absolute project root. */
  readonly projectRoot: string;
  readonly log?: (line: string) => void;
  readonly tools?: LocatedTools;
};

/** Where a project's differential test writes fresh-seed traces for the nightly oracle run. */
export const freshTraceDirectory = (context: FormalContext, projectRoot: string): string =>
  path.join(context.root, 'out/test-results/formal', path.relative(context.root, projectRoot), 'lean');

/**
 * `formal check --tier lean <projectRoot>`: every `expected.json` under `specs/` with a `lean` section.
 * With `fresh` (nightly) the oracle also runs over the fresh-seed traces there.
 */
const checkLeanProject = (
  context: FormalContext,
  options: CheckOptions,
  { log, target, fresh }: { readonly log: (line: string) => void; readonly target: string; readonly fresh?: string },
): number => {
  const locations = findExpectedFiles(options.projectRoot).filter((location) => location.file.lean !== undefined);
  if (locations.length === 0) {
    log(`${target}: no specs/**/expected.json with a lean section`);
    return 1;
  }
  const tools = options.tools ?? locateTools(context);
  const skipped = missingTools(context, { tools, needed: ['lean'], target }, log);
  if (skipped !== undefined || !tools.lean) {
    return skipped ?? 1;
  }
  const { lean } = tools;
  const steps = locations.flatMap(({ directory, file }) =>
    file.lean
      ? checkLean(context, { directory, lean, spec: file.lean, ...(fresh ? { fresh } : {}) }).map((step) => ({
          ...step,
          name: `${path.relative(context.root, directory)}/${step.name}`,
        }))
      : [],
  );
  for (const step of steps) {
    log(`${step.problems.length === 0 ? 'ok  ' : 'FAIL'} ${step.name} (${step.seconds}s)`);
    for (const problem of step.problems) {
      log(`     ${problem}`);
    }
  }
  const report: CheckReport = {
    records: steps.map((step) => ({
      name: step.name,
      actual: step.problems.length === 0 ? 'pass' : step.problems.join('; '),
      seconds: step.seconds,
      ok: step.problems.length === 0,
    })),
    failures: steps.flatMap((step) => step.problems.map((problem) => `${step.name}: ${problem}`)),
  };
  const summary = writeSummary(
    context,
    { projectRoot: options.projectRoot, tier: fresh ? 'nightly-lean' : 'lean' },
    report,
  );
  log(`${target}: ${steps.length} steps, ${report.failures.length} failures; ${path.relative(context.root, summary)}`);
  return report.failures.length === 0 ? 0 : 1;
};

/** `formal check --tier pr|nightly|lean <projectRoot>`: SANY, every config and log case of the tier, against `expected.json`. */
export const checkProject = async (context: FormalContext, options: CheckOptions): Promise<number> => {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const target = `${path.relative(context.root, options.projectRoot)}:formal${options.tier === 'pr' ? '' : `:${options.tier}`}`;
  if (options.tier === 'lean') {
    return checkLeanProject(context, options, { log, target });
  }
  const { tier } = options;
  const locations = findExpectedFiles(options.projectRoot).filter((location) => location.file.lean === undefined);
  if (locations.length === 0) {
    log(`${target}: no specs/**/expected.json`);
    return 1;
  }
  const tools = options.tools ?? locateTools(context);
  const needsApalache = locations.some(({ file }) => (file.apalache ?? []).some((entry) => entry.tier === tier));
  const skipped = missingTools(
    context,
    { tools, needed: needsApalache ? ['java', 'tlc', 'apalache'] : ['java', 'tlc'], target },
    log,
  );
  if (skipped !== undefined || !tools.java || !tools.tlc) {
    return skipped ?? 1;
  }
  const javaTools = { java: tools.java, tlc: tools.tlc, ...(tools.apalache ? { apalache: tools.apalache } : {}) };
  const plans = locations.map((location) =>
    planDirectory(context, { location, tier, tools: javaTools, projectRoot: options.projectRoot }),
  );
  const problems = plans.flatMap((plan) => plan.problems);
  for (const problem of problems) {
    log(`FAIL ${problem}`);
  }
  const { records, failures } = await runJobs(
    plans.flatMap((plan) => plan.jobs),
    log,
  );
  const report: CheckReport = { records, failures: [...problems, ...failures] };
  const summary = writeSummary(context, { projectRoot: options.projectRoot, tier: options.tier }, report);
  log(`${target}: ${records.length} runs, ${report.failures.length} failures; ${path.relative(context.root, summary)}`);
  return report.failures.length === 0 ? 0 : 1;
};

/**
 * `formal update <projectRoot>`: regenerate every graph and suite; run the owner's tests with
 * `FORMAL_UPDATE=1`, which rewrite drift manifests (refusals apply, FM-R13) and corpus traces;
 * then regenerate the Lean goldens from those traces.
 */
export const updateProject = async (
  context: FormalContext,
  projectRoot: string,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> => {
  const tools = locateTools(context);
  const locations = findExpectedFiles(projectRoot);
  for (const { directory, file } of locations) {
    for (const [module, graph] of Object.entries(file.graphs ?? {})) {
      if (!tools.java || !tools.tlc) {
        log('formal update needs java and tlc for the graphs; run pnpm nx run formal:setup');
        return 1;
      }
      // oxlint-disable-next-line no-await-in-loop -- one export at a time keeps the JVM budget.
      const exported = await exportGraph(context, {
        tools: { java: tools.java, tlc: tools.tlc },
        directory,
        module,
        ...graph,
      });
      if (exported.outcome !== 'pass') {
        log(`FAIL ${module}: ${describeOutcome(exported.outcome)}`);
        return 1;
      }
      for (const [target, text] of Object.entries(generatedFiles(directory, module, exported))) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, text);
        log(`wrote ${path.relative(context.root, target)} (${text.length} bytes)`);
      }
    }
  }
  // The owner's tests write drift manifests and corpus traces; the Lean goldens follow the traces.
  const { name } = JSON.parse(readFileSync(path.join(projectRoot, 'project.json'), 'utf8')) as {
    readonly name: string;
  };
  const tests = spawnSync('pnpm', ['nx', 'test', name, '--skip-nx-cache'], {
    cwd: context.root,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable
    env: { ...context.env, FORMAL_UPDATE: '1' },
    stdio: 'inherit',
  });
  for (const { directory, file } of locations) {
    if (file.lean) {
      if (!tools.lean) {
        log('formal update needs lean for the goldens; run pnpm nx run formal:setup');
        return 1;
      }
      const problems = checkLean(context, { directory, lean: tools.lean, spec: file.lean, update: true }).flatMap(
        (step) => step.problems.map((problem) => `${step.name}: ${problem}`),
      );
      if (problems.length > 0) {
        log(problems.map((problem) => `FAIL ${problem}`).join('\n'));
        return 1;
      }
      log(`wrote ${path.relative(context.root, directory)}/corpus/*.expected`);
    }
  }
  return tests.status ?? 1;
};

/** `formal mutants <projectRoot>`: machine mutants through Vitest, Lean mutants through the oracle when Lean is present. */
/**
 * Nightly: TLC random simulation of every exported graph from one fresh, printed seed, written to
 * `out/test-results/formal/<projectRoot>/simulated/<Module>.ndjson`. Owner conformance tests replay
 * these when `FORMAL_SIMULATED` names the directory, and so do the mutant runs.
 */
const simulateProject = async (
  context: FormalContext,
  projectRoot: string,
  log: (line: string) => void,
): Promise<{ readonly status: number; readonly directory?: string }> => {
  const graphs = findExpectedFiles(projectRoot).flatMap(({ directory, file }) =>
    Object.entries(file.graphs ?? {}).map(([module, graph]) => ({ directory, module, graph })),
  );
  if (graphs.length === 0) {
    return { status: 0 };
  }
  const output = path.join(
    context.root,
    'out/test-results/formal',
    path.relative(context.root, projectRoot),
    'simulated',
  );
  for (const { module } of graphs) {
    rmSync(path.join(output, `${module}.ndjson`), { force: true });
  }
  const tools = locateTools(context);
  if (!tools.java || !tools.tlc) {
    return {
      status:
        missingTools(
          context,
          { tools, needed: ['java', 'tlc'], target: `${path.relative(context.root, projectRoot)} simulation` },
          log,
        ) ?? 1,
    };
  }
  const seed = Number(context.env['FORMAL_SEED'] ?? Math.floor(Math.random() * 2_147_483_647));
  mkdirSync(output, { recursive: true });
  let status = 0;
  for (const { directory, module, graph } of graphs) {
    // oxlint-disable-next-line no-await-in-loop -- one simulation at a time keeps the JVM budget.
    const simulated = await simulateBehaviours(context, {
      tools: { java: tools.java, tlc: tools.tlc },
      directory,
      module,
      config: graph.config,
      seed,
      traces: 2000,
      depth: 40,
    });
    writeFileSync(
      path.join(output, `${module}.ndjson`),
      simulated.behaviours.map((behaviour) => JSON.stringify(behaviour)).join('\n'),
    );
    const ok = simulated.outcome === 'pass' && simulated.behaviours.length > 0;
    status = ok ? status : 1;
    log(
      `${ok ? 'ok  ' : 'FAIL'} simulate ${module}: seed ${seed}, ${simulated.behaviours.length} quiescent behaviours, ${describeOutcome(simulated.outcome)} (replay with FORMAL_SEED=${seed})`,
    );
  }
  return { status, directory: output };
};

export const mutantsProject = (context: FormalContext, projectRoot: string, log?: (line: string) => void): number => {
  const { lean } = locateTools(context);
  const spec = findExpectedFiles(projectRoot).find((location) => location.file.lean !== undefined)?.file.lean;
  const checker = lean && spec ? { lean: leanMutantChecker(context, { projectRoot, lean, spec }) } : {};
  return runMutants(context, { projectRoot, ...checker, ...(log ? { log } : {}) }).failures === 0 ? 0 : 1;
};

/**
 * `formal nightly <projectRoot>`: the project's nightly-tier configs and Apalache commands, the Lean
 * tier with its fresh-seed differential, fresh-seed simulation of each exported graph, and every
 * mutant matrix (whose runs replay the simulated behaviours). Each part runs; any failure fails.
 */
export const nightlyProject = async (
  context: FormalContext,
  projectRoot: string,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> => {
  const locations = findExpectedFiles(projectRoot);
  const target = `${path.relative(context.root, projectRoot)}:formal:nightly`;
  const statuses: number[] = [];
  if (locations.some((location) => location.file.lean === undefined)) {
    statuses.push(await checkProject(context, { tier: 'nightly', projectRoot, log }));
  }
  if (locations.some((location) => location.file.lean !== undefined)) {
    statuses.push(
      checkLeanProject(
        context,
        { tier: 'lean', projectRoot, log },
        { log, target, fresh: freshTraceDirectory(context, projectRoot) },
      ),
    );
  }
  const simulation = await simulateProject(context, projectRoot, log);
  statuses.push(simulation.status);
  if (findMutantFiles(projectRoot).length > 0) {
    const env = simulation.directory ? { ...context.env, FORMAL_SIMULATED: simulation.directory } : context.env; // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
    statuses.push(mutantsProject({ ...context, env }, projectRoot, log));
  }
  return statuses.every((status) => status === 0) ? 0 : 1;
};
