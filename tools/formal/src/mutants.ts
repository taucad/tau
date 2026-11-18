import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { MutantSeconds, MutantShard } from '#mutant-shard.js';
import { dealMutants, mutantKey, readMutantSeconds } from '#mutant-shard.js';
import type { Slots } from '#slots.js';
import { mapBounded, processSlots } from '#slots.js';
import type { FormalContext } from '#toolchain.js';
import { cacheDirectory } from '#toolchain.js';

/**
 * One seeded drift (FM-R10). `file` and `test` are relative to the owner project root. A mutant
 * with a `test` is a machine mutant: that test runs against a mutated copy through a module alias.
 * Without one it is a Lean mutant, checked by the Lean tier's oracle.
 */
export type Mutant = {
  readonly id: string;
  readonly drift: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly test?: string;
};

export type MutantResult = {
  readonly id: string;
  readonly verdict: 'caught' | 'survived' | 'stale';
  readonly detail?: string;
};

/** Every `mutants.json` under a project's `specs/`, with the directory it sits in. */
export const findMutantFiles = (projectRoot: string): string[] => {
  const specs = path.join(projectRoot, 'specs');
  return existsSync(specs)
    ? readdirSync(specs, { recursive: true, encoding: 'utf8' })
        .filter((entry) => path.basename(entry) === 'mutants.json')
        .map((entry) => path.join(specs, entry))
        .sort()
    : [];
};

/** Applies a mutant's edit; `undefined` when `find` does not match exactly once (a stale mutant fails). */
export const applyMutant = (source: string, mutant: Mutant): string | undefined =>
  source.split(mutant.find).length === 2 ? source.replace(mutant.find, mutant.replace) : undefined;

/**
 * A mutant's test environment. A mutant is caught against the committed corpus and goldens; the
 * nightly fresh-seed request (`FORMAL_FRESH_TRACES`) is for the unmutated differential run alone,
 * so a mutant run neither regenerates fresh traces (minutes per run) nor overwrites them with the
 * mutated code's output. `FORMAL_SIMULATED` stays: mutant runs replay the simulated behaviours.
 */
export const mutantEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'FORMAL_FRESH_TRACES'));

/** The `#…` specifier a module is imported by: its path under `src/`, e.g. `log/event-sequence`. */
const moduleName = (file: string): string => path.relative('src', file).replace(/\.ts$/, '');

/** Milliseconds a mutant's Vitest run may take before it is killed. */
const vitestTimeout = 600_000;

/**
 * One Vitest run without blocking, so mutants share the runner's cores. The output is stdout, then
 * stderr, as `spawnSync` gives them; `status` is `undefined` when the run could not start or was killed
 * (its timeout included).
 */
const runVitest = async (
  vitest: string,
  { config, cwd, env }: { readonly config: string; readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Promise<{ readonly output: string; readonly status: number | undefined }> =>
  new Promise((resolve) => {
    const child = spawn(vitest, ['run', '--config', config], { cwd, env, timeout: vitestTimeout });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ output: `${stdout}${stderr}${String(error)}`, status: undefined });
    });
    child.on('close', (status) => {
      resolve({ output: `${stdout}${stderr}`, status: status ?? undefined });
    });
  });

/**
 * Runs one machine mutant: the mutated copy lives in its own cache directory with its package-internal
 * `#…` imports made absolute, and a generated Vitest config aliases the original module to it (S6). The
 * config keeps Vite's and Vitest's cache in that directory too, so mutants that run at once share no
 * files. The mutant is caught when the owner's test fails.
 */
const runMachineMutant = async (
  context: FormalContext,
  {
    projectRoot,
    mutant,
    mutated,
    slots,
  }: { readonly projectRoot: string; readonly mutant: Mutant; readonly mutated: string; readonly slots: Slots },
): Promise<MutantResult> => {
  const work = mkdtempSync(path.join(cacheDirectory(context), `mutant-${mutant.id}-`));
  try {
    const copy = path.join(work, path.basename(mutant.file));
    writeFileSync(
      copy,
      mutated.replaceAll(
        /from '#([^']+)\.js'/g,
        (_match, module: string) => `from '${path.join(projectRoot, 'src', `${module}.ts`)}'`,
      ),
    );
    const alias = new RegExp(`^#${moduleName(mutant.file).replaceAll('.', String.raw`\.`)}\\.js$`);
    const config = path.join(work, 'vitest.mutant.config.ts');
    writeFileSync(
      config,
      [
        "import { defineConfig } from 'vitest/config';",
        "import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';",
        'export default defineConfig({',
        `  root: ${JSON.stringify(projectRoot)},`,
        `  cacheDir: ${JSON.stringify(path.join(work, 'vite'))},`,
        '  plugins: [nxViteTsPaths()],',
        `  resolve: { alias: [{ find: ${alias.toString()}, replacement: ${JSON.stringify(copy)} }] },`,
        `  test: { environment: 'node', include: [${JSON.stringify(mutant.test)}] },`,
        '});',
        '',
      ].join('\n'),
    );
    const result = await slots.run(async () =>
      runVitest(path.join(context.root, 'node_modules/.bin/vitest'), {
        config,
        cwd: path.join(projectRoot, path.dirname(mutant.file)),
        env: mutantEnv(context.env),
      }),
    );
    const failed = result.output.split('\n').filter((line) => /^\s*(?:×|FAIL)\s/.test(line));
    return result.status === 0
      ? { id: mutant.id, verdict: 'survived' }
      : {
          id: mutant.id,
          verdict: 'caught',
          detail: failed
            .slice(0, 3)
            .map((line) => line.trim())
            .join(' | '),
        };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const baselineKey = (mutant: Mutant): string => `${mutant.file}|${mutant.test ?? ''}`;

/**
 * The control run: each machine test, unmutated but through the same alias, must pass, or every
 * mutant would look caught. Returns the file and test pairs whose control fails.
 */
const failingBaselines = async (
  context: FormalContext,
  {
    projectRoot,
    mutants,
    slots,
  }: { readonly projectRoot: string; readonly mutants: readonly Mutant[]; readonly slots: Slots },
): Promise<Set<string>> => {
  const controls = [...new Map(mutants.filter((mutant) => mutant.test).map((mutant) => [baselineKey(mutant), mutant]))];
  const verdicts = await Promise.all(
    controls.map(async ([, mutant]) =>
      runMachineMutant(context, {
        projectRoot,
        mutant: { ...mutant, id: 'baseline' },
        mutated: readFileSync(path.join(projectRoot, mutant.file), 'utf8'),
        slots,
      }),
    ),
  );
  return new Set(controls.filter((_control, index) => verdicts[index]?.verdict !== 'survived').map(([key]) => key));
};

/** The keys of one shard's mutants, dealt over every `mutants.json` of the project. */
const shardKeys = (
  context: FormalContext,
  options: { readonly projectRoot: string; readonly seconds?: MutantSeconds },
  shard: MutantShard,
): Set<string> => {
  const files = findMutantFiles(options.projectRoot).map((file) => ({
    file: path.relative(context.root, file),
    mutants: JSON.parse(readFileSync(file, 'utf8')) as Mutant[],
  }));
  const dealt = dealMutants(files, shard.count, options.seconds ?? readMutantSeconds());
  return new Set(dealt[shard.index - 1] ?? []);
};

export type MutantOptions = {
  readonly projectRoot: string;
  /** Checks a Lean mutant (FM-S7), starting its processes in `slots`; machine mutants use Vitest. */
  readonly lean?: (mutant: Mutant, mutated: string, slots: Slots) => Promise<MutantResult>;
  readonly log?: (line: string) => void;
  /**
   * One of several runners: only this shard's mutants run, with their controls (`dealMutants`, by the
   * measured seconds in `seconds`, default `mutant-seconds.json`). The shards partition the mutants, so
   * all of them together run every mutant once, each with the verdict an unsharded run gives it.
   */
  readonly shard?: MutantShard;
  readonly seconds?: MutantSeconds;
  /**
   * The bound on child processes at once, shared by every mutant's control, build, oracle and Vitest
   * runs; at most this many mutants are in flight. Default: one per core of the runner.
   */
  readonly slots?: Slots;
};

/** The log line of one mutant's verdict. */
export const mutantLine = (mutant: Mutant, result: MutantResult): string =>
  `${result.verdict === 'caught' ? 'ok  ' : 'FAIL'} mutant ${mutant.id}: ${result.verdict} (${mutant.drift})${result.detail ? `\n       ${result.detail}` : ''}`;

/**
 * `formal mutants <projectRoot>`: every mutant must be caught, and a stale one fails (FM-A11).
 * Mutants are independent (each has its own copy, build directory and Vitest cache under a fresh
 * cache directory, and none opens a port), so they run side by side within `slots`. Each verdict is
 * the one a serial run gives, and the lines are logged and the results returned in `mutants.json`
 * order: a line waits for the mutants before it.
 */
export const runMutants = async (
  context: FormalContext,
  options: MutantOptions,
): Promise<{ readonly results: MutantResult[]; readonly failures: number }> => {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const slots = options.slots ?? processSlots(availableParallelism());
  mkdirSync(cacheDirectory(context), { recursive: true });
  const mine = options.shard ? shardKeys(context, options, options.shard) : undefined;
  const files = findMutantFiles(options.projectRoot).map((file) =>
    (JSON.parse(readFileSync(file, 'utf8')) as Mutant[]).filter(
      (_mutant, index) => mine?.has(mutantKey(path.relative(context.root, file), index)) ?? true,
    ),
  );
  const failing = await Promise.all(
    files.map(async (mutants) => failingBaselines(context, { projectRoot: options.projectRoot, mutants, slots })),
  );
  const planned = files.flatMap((mutants, file) =>
    mutants.map((mutant) => ({ mutant, controls: failing[file] ?? new Set<string>() })),
  );
  const done: Array<MutantResult | undefined> = Array.from({ length: planned.length });
  let logged = 0;
  const logReady = (): void => {
    while (logged < planned.length) {
      const result = done[logged];
      const entry = planned[logged];
      if (result === undefined || entry === undefined) {
        return;
      }
      log(mutantLine(entry.mutant, result));
      logged += 1;
    }
  };
  const results = await mapBounded(planned, slots.limit, async ({ mutant, controls }, index) => {
    const mutated = applyMutant(readFileSync(path.join(options.projectRoot, mutant.file), 'utf8'), mutant);
    const result: MutantResult =
      mutated === undefined
        ? { id: mutant.id, verdict: 'stale' }
        : controls.has(baselineKey(mutant))
          ? { id: mutant.id, verdict: 'stale', detail: `${mutant.test ?? ''} fails without the mutant` }
          : mutant.test
            ? await runMachineMutant(context, { projectRoot: options.projectRoot, mutant, mutated, slots })
            : ((await options.lean?.(mutant, mutated, slots)) ?? { id: mutant.id, verdict: 'stale' });
    done[index] = result;
    logReady();
    return result;
  });
  return { results, failures: results.filter((result) => result.verdict !== 'caught').length };
};
