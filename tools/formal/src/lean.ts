import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LeanExpectation } from '#expected.js';
import type { Mutant, MutantResult } from '#mutants.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory, readLock } from '#toolchain.js';

type LeanTool = NonNullable<LocatedTools['lean']>;

/** Axioms that are not in the allowlist, `sorry` warnings and errors, from `lean` output (FM-R9). */
export const leanOutputProblems = (output: string, allowlist: readonly string[]): string[] =>
  output.split('\n').flatMap((line): string[] => {
    const axioms = /^('[^']+') depends on axioms: \[([^\]]*)]/.exec(line);
    if (axioms) {
      return (axioms[2] ?? '')
        .split(',')
        .map((axiom) => axiom.trim())
        .filter((axiom) => axiom !== '' && !allowlist.includes(axiom))
        .map((axiom) => `${axioms[1] ?? ''} depends on ${axiom}`);
    }
    return /declaration uses 'sorry'|:\d+:\d+: error/.test(line) ? [line.trim()] : [];
  });

/** FM-R9 on the sources: `Init`, `Std` and the spec's own modules only; no `sorry` or `native_decide`. */
export const leanSourceProblems = (file: string, text: string, modules: readonly string[]): string[] => [
  ...[...text.matchAll(/^import\s+(\S+)/gm)]
    .map((match) => match[1] ?? '')
    .filter((module) => !/^(?:Init|Std)(?:\.|$)/.test(module) && !modules.includes(module))
    .map((module) => `${file} imports ${module}`),
  ...(/\bnative_decide\b/.test(text) ? [`${file} uses native_decide`] : []),
  ...(/\bsorry\b/.test(text) ? [`${file} uses sorry`] : []),
  ...(/^\s*axiom\s/m.test(text) ? [`${file} declares an axiom`] : []),
];

/** Theorems no `#print axioms` audits; `namespace` is the one the modules declare them in. */
export const unauditedTheorems = (sources: readonly string[], namespace: string): string[] => {
  const text = sources.join('\n');
  const audited = new Set([...text.matchAll(/^#print axioms (\S+)/gm)].map((match) => match[1] ?? ''));
  return [...text.matchAll(/^(?:theorem|lemma) ([\w'.]+)/gm)]
    .map((match) => `${namespace}.${match[1] ?? ''}`)
    .filter((name) => !audited.has(name));
};

/** The first line where the committed goldens and the oracle's output differ. */
export const firstDifferingLine = (expected: string, actual: string): string | undefined => {
  const left = expected.split('\n');
  const right = actual.split('\n');
  const index = Array.from({ length: Math.max(left.length, right.length) }, (_unused, position) => position).find(
    (position) => left[position] !== right[position],
  );
  return index === undefined
    ? undefined
    : `line ${index + 1}: expected ${JSON.stringify(left[index] ?? '')}, got ${JSON.stringify(right[index] ?? '')}`;
};

const runLean = (
  lean: LeanTool,
  { build, cwd, args }: { readonly build: string; readonly cwd: string; readonly args: readonly string[] },
): { readonly output: string; readonly status: number } => {
  const result = spawnSync(lean.bin, args, {
    cwd,
    env: { ...process.env, LEAN_PATH: `${build}:${lean.lib}` }, // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 600_000,
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status ?? 1 };
};

const corpusTraces = (directory: string): string[] => {
  const corpus = path.join(directory, 'corpus');
  return existsSync(corpus)
    ? readdirSync(corpus)
        .filter((entry) => entry.endsWith('.trace'))
        .sort()
        .map((entry) => path.join(corpus, entry))
    : [];
};

const goldenOf = (trace: string): string => trace.replace(/\.trace$/, '.expected');

/** Runs the oracle on one corpus trace, with the model already built into `build`. */
const oracleOutput = (
  lean: LeanTool,
  {
    build,
    directory,
    oracle,
    trace,
  }: { readonly build: string; readonly directory: string; readonly oracle: string; readonly trace: string },
): string => runLean(lean, { build, cwd: directory, args: ['--run', oracle, trace] }).output;

export type LeanStep = { readonly name: string; readonly seconds: number; readonly problems: readonly string[] };

const nonEmptyLines = (text: string): string =>
  text
    .split('\n')
    .filter((line) => line.length > 0)
    .join('\n');

export type LeanCheck = {
  readonly directory: string;
  readonly lean: LeanTool;
  readonly spec: LeanExpectation;
  /** Rewrite the goldens instead of comparing them (`formal update`). */
  readonly update?: boolean;
  /**
   * Nightly: a directory of fresh-seed `<name>.trace` files, each with the TypeScript's output as
   * `<name>.typescript`, written by the owner's differential test; the oracle must agree with each.
   */
  readonly fresh?: string;
};

/**
 * The Lean tier of one `specs/lean` directory: the toolchain file matches the lock; the modules
 * build in order with no `sorry` and axioms within the allowlist; the committed goldens equal the
 * oracle's output on every corpus trace; and, nightly, the oracle agrees with fresh-seed traces.
 */
export const checkLean = (
  context: FormalContext,
  { directory, lean, spec, update = false, fresh }: LeanCheck,
): LeanStep[] => {
  mkdirSync(cacheDirectory(context), { recursive: true });
  const build = mkdtempSync(path.join(cacheDirectory(context), 'lean-build-'));
  const timed = (name: string, work: () => string[]): LeanStep => {
    const started = performance.now();
    const problems = work();
    return { name, seconds: Math.round(performance.now() - started) / 1000, problems };
  };
  try {
    const pinned = `leanprover/lean4:v${readLock().lean.version}`;
    const toolchainFile = path.join(directory, 'lean-toolchain');
    const sources = spec.modules.map((module) => readFileSync(path.join(directory, `${module}.lean`), 'utf8'));
    const steps = [
      timed('lean-toolchain', () => {
        const found = existsSync(toolchainFile) ? readFileSync(toolchainFile, 'utf8').trim() : 'absent';
        return found === pinned ? [] : [`lean-toolchain is ${found}; toolchain.lock pins ${pinned}`];
      }),
      timed('axiom audit coverage', () =>
        unauditedTheorems(sources, spec.modules[0] ?? '').map((name) => `${name} is not in any #print axioms`),
      ),
      ...spec.modules.map((module) =>
        timed(`${module}.lean`, () => {
          const file = `${module}.lean`;
          const source = leanSourceProblems(file, readFileSync(path.join(directory, file), 'utf8'), spec.modules);
          const { output, status } = runLean(lean, {
            build,
            cwd: directory,
            args: ['-o', path.join(build, `${module}.olean`), file],
          });
          const problems = [...source, ...leanOutputProblems(output, spec.axioms)];
          return status === 0 || problems.length > 0
            ? problems
            : [`${file}: lean exited ${status}: ${output.trim().split('\n').slice(0, 5).join(' | ')}`];
        }),
      ),
    ];
    if (steps.some((step) => step.problems.length > 0)) {
      return steps;
    }
    const goldens = corpusTraces(directory).map((trace) =>
      timed(`corpus/${path.basename(trace)}`, () => {
        const actual = oracleOutput(lean, { build, directory, oracle: spec.oracle, trace });
        const golden = goldenOf(trace);
        if (update) {
          writeFileSync(golden, actual);
          return [];
        }
        const difference = existsSync(golden) ? firstDifferingLine(readFileSync(golden, 'utf8'), actual) : 'no goldens';
        return difference === undefined
          ? []
          : [`${path.relative(directory, golden)} is stale (${difference}): run formal update`];
      }),
    );
    const freshTraces =
      fresh && existsSync(fresh)
        ? readdirSync(fresh)
            .filter((entry) => entry.endsWith('.trace'))
            .sort()
        : [];
    const differentials = freshTraces.map((entry) =>
      timed(`fresh/${entry}`, () => {
        const trace = path.join(fresh ?? '', entry);
        const typescript = trace.replace(/\.trace$/, '.typescript');
        const expected = existsSync(typescript) ? readFileSync(typescript, 'utf8') : '';
        const difference = firstDifferingLine(
          nonEmptyLines(expected),
          nonEmptyLines(oracleOutput(lean, { build, directory, oracle: spec.oracle, trace })),
        );
        return difference === undefined
          ? []
          : [`${entry}: the TypeScript and the oracle differ (${difference}); add the trace to the corpus`];
      }),
    );
    return [...steps, ...goldens, ...differentials];
  } finally {
    rmSync(build, { recursive: true, force: true });
  }
};

/**
 * Checks one Lean mutant (FM-A11): build the mutated module with the oracle and run the oracle over
 * the corpus. The mutant is caught when any trace's output differs from its committed goldens.
 */
export const leanMutantChecker =
  (
    context: FormalContext,
    {
      projectRoot,
      lean,
      spec,
    }: { readonly projectRoot: string; readonly lean: LeanTool; readonly spec: LeanExpectation },
  ) =>
  (mutant: Mutant, mutated: string): MutantResult => {
    const directory = path.join(projectRoot, path.dirname(mutant.file));
    mkdirSync(cacheDirectory(context), { recursive: true });
    const build = mkdtempSync(path.join(cacheDirectory(context), `mutant-${mutant.id}-`));
    try {
      const file = path.join(build, path.basename(mutant.file));
      writeFileSync(file, mutated);
      const built = runLean(lean, {
        build,
        cwd: build,
        args: ['-o', path.join(build, path.basename(mutant.file).replace(/\.lean$/, '.olean')), file],
      });
      if (built.status !== 0) {
        return {
          id: mutant.id,
          verdict: 'stale',
          detail: `does not build: ${built.output.trim().split('\n')[0] ?? ''}`,
        };
      }
      const traces = corpusTraces(directory);
      const differing = traces.flatMap((trace) => {
        const difference = firstDifferingLine(
          readFileSync(goldenOf(trace), 'utf8'),
          oracleOutput(lean, { build, directory, oracle: spec.oracle, trace }),
        );
        return difference === undefined ? [] : [`${path.basename(trace)} ${difference}`];
      });
      return differing.length > 0
        ? { id: mutant.id, verdict: 'caught', detail: differing[0] ?? '' }
        : { id: mutant.id, verdict: 'survived' };
    } finally {
      rmSync(build, { recursive: true, force: true });
    }
  };
