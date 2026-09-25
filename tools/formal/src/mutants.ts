import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const moduleName = (file: string): string => path.basename(file).replace(/\.ts$/, '');

/**
 * Runs one machine mutant: the mutated copy lives in the cache with its package-internal `#…`
 * imports made absolute, and a generated Vitest config aliases the original module to it (S6).
 * The mutant is caught when the owner's test fails.
 */
const runMachineMutant = (
  context: FormalContext,
  { projectRoot, mutant, mutated }: { readonly projectRoot: string; readonly mutant: Mutant; readonly mutated: string },
): MutantResult => {
  const work = mkdtempSync(path.join(cacheDirectory(context), `mutant-${mutant.id}-`));
  try {
    const source = path.join(projectRoot, path.dirname(mutant.file));
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
        '  plugins: [nxViteTsPaths()],',
        `  resolve: { alias: [{ find: ${alias.toString()}, replacement: ${JSON.stringify(copy)} }] },`,
        `  test: { environment: 'node', include: [${JSON.stringify(mutant.test)}] },`,
        '});',
        '',
      ].join('\n'),
    );
    const vitest = path.join(context.root, 'node_modules/.bin/vitest');
    const result = spawnSync(vitest, ['run', '--config', config], {
      cwd: source,
      env: context.env,
      encoding: 'utf8',
      timeout: 600_000,
    });
    const failed = `${result.stdout}${result.stderr}`.split('\n').filter((line) => /^\s*(?:×|FAIL)\s/.test(line));
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
const failingBaselines = (context: FormalContext, projectRoot: string, mutants: readonly Mutant[]): Set<string> => {
  const controls = new Map(mutants.filter((mutant) => mutant.test).map((mutant) => [baselineKey(mutant), mutant]));
  return new Set(
    [...controls]
      .filter(
        ([, mutant]) =>
          runMachineMutant(context, {
            projectRoot,
            mutant: { ...mutant, id: 'baseline' },
            mutated: readFileSync(path.join(projectRoot, mutant.file), 'utf8'),
          }).verdict !== 'survived',
      )
      .map(([key]) => key),
  );
};

export type MutantOptions = {
  readonly projectRoot: string;
  /** Checks a Lean mutant (FM-S7); machine mutants use Vitest. */
  readonly lean?: (mutant: Mutant, mutated: string) => MutantResult;
  readonly log?: (line: string) => void;
};

/** `formal mutants <projectRoot>`: every mutant must be caught, and a stale one fails (FM-A11). */
export const runMutants = (
  context: FormalContext,
  options: MutantOptions,
): { readonly results: MutantResult[]; readonly failures: number } => {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  mkdirSync(cacheDirectory(context), { recursive: true });
  const results = findMutantFiles(options.projectRoot).flatMap((file) => {
    const mutants = JSON.parse(readFileSync(file, 'utf8')) as Mutant[];
    const failing = failingBaselines(context, options.projectRoot, mutants);
    return mutants.map((mutant): MutantResult => {
      const mutated = applyMutant(readFileSync(path.join(options.projectRoot, mutant.file), 'utf8'), mutant);
      const result: MutantResult =
        mutated === undefined
          ? { id: mutant.id, verdict: 'stale' }
          : failing.has(baselineKey(mutant))
            ? { id: mutant.id, verdict: 'stale', detail: `${mutant.test ?? ''} fails without the mutant` }
            : mutant.test
              ? runMachineMutant(context, { projectRoot: options.projectRoot, mutant, mutated })
              : (options.lean?.(mutant, mutated) ?? { id: mutant.id, verdict: 'stale' });
      log(
        `${result.verdict === 'caught' ? 'ok  ' : 'FAIL'} mutant ${mutant.id}: ${result.verdict} (${mutant.drift})${result.detail ? `\n       ${result.detail}` : ''}`,
      );
      return result;
    });
  });
  return { results, failures: results.filter((result) => result.verdict !== 'caught').length };
};
