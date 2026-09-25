import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** What a run reports: a pass, a violated property, a rejected trace row, or Apalache's verdict (FM-R3). */
export type Verdict =
  | 'pass'
  | { readonly violated: string }
  | { readonly rejected: { readonly row: number; readonly rules: readonly string[] } }
  | 'NoError'
  | 'Error';

export type Tier = 'pr' | 'nightly';

export type Expectation = {
  readonly tier: Tier;
  readonly expect: Verdict;
  /** Required unless `expect` is `pass` or `NoError`. */
  readonly kind?: 'defect' | 'witness' | 'limit';
  /** Evidence, e.g. `S4 O1`, `L6 N2`. */
  readonly ref?: string;
  /** The work package that fixes a `defect`. */
  readonly fixedBy?: string;
};

export type ApalacheExpectation = Expectation & { readonly args: readonly string[] };

export type LeanExpectation = {
  readonly modules: readonly string[];
  readonly axioms: readonly string[];
  readonly oracle: string;
};

/** One per `specs/` directory that holds modules. */
export type ExpectedFile = {
  /** `<Module>.<scenario>.cfg` → expectation. */
  readonly configs?: Readonly<Record<string, Expectation>>;
  readonly apalache?: readonly ApalacheExpectation[];
  /** Trace spec → log file (relative to the directory) → expectation. */
  readonly logs?: Readonly<Record<string, Readonly<Record<string, Expectation>>>>;
  /** Module → the configuration that exports its graph, the field that names its phase, and the variable that labels a step (default `act`). */
  readonly graphs?: Readonly<
    Record<string, { readonly config: string; readonly phase: string; readonly action?: string }>
  >;
  readonly lean?: LeanExpectation;
};

/** A run's outcome: a verdict, or an error that is never a pass (unparseable output, assumption failure, watchdog). */
export type Outcome = Verdict | { readonly error: string };

const isPassing = (verdict: Verdict): boolean => verdict === 'pass' || verdict === 'NoError';

export const describeOutcome = (outcome: Outcome): string => {
  if (typeof outcome === 'string') {
    return outcome;
  }
  if ('error' in outcome) {
    return `error (${outcome.error})`;
  }
  if ('violated' in outcome) {
    return `violated ${outcome.violated}`;
  }
  const { row, rules } = outcome.rejected;
  return rules.length > 0 ? `rejected at row ${row} by ${rules.join(', ')}` : `rejected at row ${row}`;
};

const sameVerdict = (expected: Verdict, actual: Outcome): boolean => {
  if (typeof expected === 'string' || typeof actual === 'string') {
    return expected === actual;
  }
  if ('error' in actual) {
    return false;
  }
  if ('violated' in expected) {
    return 'violated' in actual && actual.violated === expected.violated;
  }
  return (
    'rejected' in actual &&
    actual.rejected.row === expected.rejected.row &&
    [...actual.rejected.rules].sort().join(',') === [...expected.rejected.rules].sort().join(',')
  );
};

/**
 * Compares a run with its expectation. A changed verdict fails until `expected.json` changes (FM-R3):
 * a defect that starts passing is reported as fixed, so its entry must be updated in the same change.
 */
export const compareOutcome = (expectation: Expectation, actual: Outcome): string | undefined => {
  if (sameVerdict(expectation.expect, actual)) {
    return undefined;
  }
  const flipped = !isPassing(expectation.expect) && typeof actual === 'string' && isPassing(actual);
  const note = flipped
    ? `; the ${expectation.kind ?? 'expected failure'}${expectation.ref ? ` (${expectation.ref})` : ''} no longer fails: update expected.json`
    : '';
  return `expected ${describeOutcome(expectation.expect)}, got ${describeOutcome(actual)}${note}`;
};

/** Structural rules on an expectation file; returns one message per problem. */
export const lintExpectedFile = (file: ExpectedFile): string[] => {
  const problems: string[] = [];
  const entries: Array<[string, Expectation]> = [
    ...Object.entries(file.configs ?? {}),
    ...(file.apalache ?? []).map((entry, index): [string, Expectation] => [`apalache[${index}]`, entry]),
    ...Object.entries(file.logs ?? {}).flatMap(([spec, logs]) =>
      Object.entries(logs).map(([log, entry]): [string, Expectation] => [`${spec}:${log}`, entry]),
    ),
  ];
  for (const [name, entry] of entries) {
    if (!isPassing(entry.expect) && entry.kind === undefined) {
      problems.push(`${name}: a non-pass verdict needs a kind (defect, witness or limit)`);
    }
    if (entry.kind === 'defect' && entry.fixedBy === undefined) {
      problems.push(`${name}: a defect names the work package that fixes it (fixedBy)`);
    }
  }
  return problems;
};

export type ExpectedLocation = { readonly directory: string; readonly file: ExpectedFile };

/** Every `expected.json` under `<projectRoot>/specs`, sorted by path. */
export const findExpectedFiles = (projectRoot: string): ExpectedLocation[] => {
  const specs = path.join(projectRoot, 'specs');
  if (!existsSync(specs)) {
    return [];
  }
  return readdirSync(specs, { recursive: true, encoding: 'utf8' })
    .filter((entry) => path.basename(entry) === 'expected.json')
    .sort()
    .map((entry) => {
      const full = path.join(specs, entry);
      return { directory: path.dirname(full), file: JSON.parse(readFileSync(full, 'utf8')) as ExpectedFile };
    });
};

export type KnownRow = { readonly where: string; readonly name: string; readonly expectation: Expectation };

/** `formal known`: every non-pass expectation, for the SC2 audit. */
export const knownFailures = (locations: readonly ExpectedLocation[], root: string): KnownRow[] =>
  locations.flatMap(({ directory, file }) => {
    const where = path.relative(root, directory);
    const rows: KnownRow[] = [
      ...Object.entries(file.configs ?? {}).map(([name, expectation]) => ({ where, name, expectation })),
      ...(file.apalache ?? []).map((expectation) => ({
        where,
        name: `apalache ${expectation.args.join(' ')}`,
        expectation,
      })),
      ...Object.entries(file.logs ?? {}).flatMap(([spec, logs]) =>
        Object.entries(logs).map(([log, expectation]) => ({ where, name: `${spec} ${log}`, expectation })),
      ),
    ];
    return rows.filter((row) => !isPassing(row.expectation.expect));
  });

/** Project roots that hold a `specs/` directory, for `formal known` without arguments. */
export const specProjectRoots = (root: string): string[] =>
  ['apps', 'libs', 'packages', 'tools']
    .flatMap((base) =>
      existsSync(path.join(root, base))
        ? readdirSync(path.join(root, base)).map((name) => path.join(root, base, name))
        : [],
    )
    .filter((projectRoot) => existsSync(path.join(projectRoot, 'specs')))
    .sort();
