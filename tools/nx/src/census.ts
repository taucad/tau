/**
 * Project size census and simulated affected rates: the pure half of the
 * `nx:census` report (`census-cli.ts` does the IO).
 *
 * The report measures every workspace project against the advisory size target
 * of the workspace project policy: source files, test cases, uncached `test`
 * time where a duration file supplies it, dependency closure, fan-in, and how
 * often recent landings touch a project compared with how often they make it
 * affected. Nothing here fails a build; the thresholds only flag.
 */

/**
 * The advisory size target (workspace project policy, "Size projects for CI").
 *
 * @public
 */
export const sizeThresholds = {
  /** Non-test source files owned by the project. */
  sourceFiles: 100,
  /** `it`/`test` call sites in the project's test files. */
  testCases: 300,
  /** Uncached `test` task wall time, when a duration file supplies it. */
  testSeconds: 180,
  /** Graph-affected rate over touched rate. */
  affectedToTouched: 2,
  /**
   * The affected check applies only to a project touched by at least this share
   * of the window: below it the ratio rests on a handful of commits, and every
   * project with a dependency would be flagged for its dependencies' churn.
   */
  minTouchedForAffected: 0.02,
} as const;

/**
 * One project node, as the census reads it from the Nx graph.
 *
 * @public
 */
export type CensusProject = {
  readonly name: string;
  readonly root: string;
  readonly hasTest: boolean;
};

/**
 * The workspace graph: projects plus each project's direct workspace dependencies.
 *
 * @public
 */
export type CensusGraph = {
  readonly projects: readonly CensusProject[];
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
};

/**
 * One commit of the history window and the paths it changed.
 *
 * @public
 */
export type CommitTouches = {
  readonly sha: string;
  readonly files: readonly string[];
};

/**
 * Files whose change marks every project: Nx `sharedGlobals`, and the lockfile
 * (kept apart so the report shows the rate with and without it).
 *
 * @public
 */
export type GlobalFiles = {
  readonly shared: readonly string[];
  readonly lockfiles: readonly string[];
};

/**
 * Per-file facts a project's size is summed from.
 *
 * @public
 */
export type FileFacts = {
  readonly path: string;
  /** Line count, for source files. */
  readonly lines?: number;
  /** `it`/`test` call sites, for test files. */
  readonly testCases?: number;
};

/**
 * The counted size of one project.
 *
 * @public
 */
export type ProjectSize = {
  sourceFiles: number;
  sourceLines: number;
  testFiles: number;
  testCases: number;
};

/**
 * The share of the history window that touches or affects one project.
 *
 * @public
 */
export type ProjectRates = {
  /** Commits that change a file the project owns. */
  readonly touched: number;
  /** Commits that make it affected with the lockfile global (current behaviour). */
  readonly affected: number;
  /** Commits that make it affected with the lockfile dropped. */
  readonly affectedWithoutLockfile: number;
  /** Commits that make it affected through its own files or a dependency, ignoring global files. */
  readonly affectedByGraph: number;
};

/**
 * One row of the report.
 *
 * @public
 */
export type CensusRow = ProjectSize & {
  readonly name: string;
  readonly root: string;
  readonly dependencies: number;
  readonly closure: number;
  readonly dependents: number;
  readonly fanIn: number;
  readonly testSeconds: number | undefined;
  /** Fractions of the window, 0–1. */
  readonly rates: ProjectRates;
  readonly flags: readonly string[];
};

/**
 * The whole report, as written to JSON.
 *
 * @public
 */
export type CensusReport = {
  readonly generatedAt: string;
  readonly ref: string;
  readonly commits: number;
  readonly globalCommits: number;
  readonly lockfileCommits: number;
  readonly thresholds: typeof sizeThresholds;
  readonly rows: readonly CensusRow[];
};

const sourceExtension = /\.(?:[cm]?[jt]sx?|py|rs)$/;
const testBasename = /(?:\.(?:test|spec|test-d|e2e)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]*\.py|_test\.py)$/;
const testDirectory = /(?:^|\/)(?:__tests__|tests?|e2e)\//;
const javascriptTest = /\.[cm]?[jt]sx?$/;

/**
 * A test file: a `*.test`/`*.spec`/`*.test-d`/`*.e2e` module, a pytest module,
 * or any source file under a `test`, `tests`, `__tests__` or `e2e` folder.
 *
 * @public
 */
export const isTestFile = (path: string): boolean =>
  sourceExtension.test(path) && (testBasename.test(path) || testDirectory.test(path));

/**
 * A non-test source file. Declaration files count: they are authored or
 * vendored surface a project carries.
 *
 * @public
 */
export const isSourceFile = (path: string): boolean => sourceExtension.test(path) && !isTestFile(path);

/**
 * Whether a test file's cases are counted from its text (JavaScript or TypeScript only).
 *
 * @public
 */
export const countsTestCases = (path: string): boolean => isTestFile(path) && javascriptTest.test(path);

const testCall = /(?<![\w$.])(?:it|test)(?:\.[A-Za-z]+)*[(`]/g;

/**
 * Approximate test cases in a test file: `it(`/`test(` call sites, with
 * modifiers (`it.skip(`, `test.each(`). A table test (`it.each`) counts once,
 * and a call in a comment counts too, so this is the census's static measure,
 * not Vitest's runtime count.
 *
 * @public
 */
export const countTestCases = (text: string): number => text.match(testCall)?.length ?? 0;

/**
 * Line count of a file's text: a trailing newline does not start a line.
 *
 * @public
 */
export const countLines = (text: string): number =>
  text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * Map a path to the project with the longest root containing it. A root of `.`
 * owns only what no other project owns.
 *
 * @public
 */
export const createOwner = (projects: readonly CensusProject[]): ((path: string) => string | undefined) => {
  const roots = projects
    .map(({ name, root }) => ({ name, prefix: root === '.' || root === '' ? '' : `${root.replace(/\/$/, '')}/` }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return (path) => roots.find(({ prefix }) => path.startsWith(prefix))?.name;
};

/**
 * Sum per-file facts into per-project sizes.
 *
 * @public
 */
export const sizeProjects = (
  projects: readonly CensusProject[],
  files: readonly FileFacts[],
): Map<string, ProjectSize> => {
  const owner = createOwner(projects);
  const sizes = new Map(
    projects.map(({ name }) => [name, { sourceFiles: 0, sourceLines: 0, testFiles: 0, testCases: 0 }]),
  );
  for (const file of files) {
    const size = sizes.get(owner(file.path) ?? '');
    if (size === undefined) {
      continue;
    }

    if (isTestFile(file.path)) {
      size.testFiles += 1;
      size.testCases += file.testCases ?? 0;
    } else if (isSourceFile(file.path)) {
      size.sourceFiles += 1;
      size.sourceLines += file.lines ?? 0;
    }
  }

  return sizes;
};

/**
 * Invert direct-dependency edges into direct-dependent edges.
 *
 * @public
 */
export const reverseEdges = (edges: Readonly<Record<string, readonly string[]>>): Record<string, string[]> => {
  const reversed: Record<string, string[]> = {};
  for (const [source, targets] of Object.entries(edges)) {
    for (const target of targets) {
      (reversed[target] ??= []).push(source);
    }
  }

  return reversed;
};

/**
 * Everything reachable from `starts` over `edges`, the starts included.
 *
 * @public
 */
export const reach = (starts: Iterable<string>, edges: Readonly<Record<string, readonly string[]>>): Set<string> => {
  const seen = new Set<string>();
  const stack = [...starts];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (!seen.has(next)) {
      seen.add(next);
      stack.push(...(edges[next] ?? []));
    }
  }

  return seen;
};

/**
 * Replay a commit window against the graph: for each commit, the projects it
 * touches are closed over their dependents, and a commit that changes a global
 * file marks every project.
 *
 * @public
 */
export const simulateRates = (
  graph: CensusGraph,
  commits: readonly CommitTouches[],
  globals: GlobalFiles,
): { rates: Map<string, ProjectRates>; globalCommits: number; lockfileCommits: number } => {
  const owner = createOwner(graph.projects);
  const dependents = reverseEdges(graph.dependencies);
  const shared = new Set(globals.shared);
  const lockfiles = new Set(globals.lockfiles);
  const counts = new Map(
    graph.projects.map(({ name }) => [
      name,
      { touched: 0, affected: 0, affectedWithoutLockfile: 0, affectedByGraph: 0 },
    ]),
  );
  let globalCommits = 0;
  let lockfileCommits = 0;
  for (const commit of commits) {
    const touched = new Set(commit.files.flatMap((file) => owner(file) ?? []));
    const byGraph = reach(touched, dependents);
    const sharedChange = commit.files.some((file) => shared.has(file));
    const lockfileChange = commit.files.some((file) => lockfiles.has(file));
    globalCommits += sharedChange || lockfileChange ? 1 : 0;
    lockfileCommits += lockfileChange ? 1 : 0;
    for (const [name, count] of counts) {
      const graphHit = byGraph.has(name);
      count.touched += touched.has(name) ? 1 : 0;
      count.affectedByGraph += graphHit ? 1 : 0;
      count.affectedWithoutLockfile += graphHit || sharedChange ? 1 : 0;
      count.affected += graphHit || sharedChange || lockfileChange ? 1 : 0;
    }
  }

  const total = Math.max(commits.length, 1);
  const rates = new Map(
    [...counts].map(([name, count]) => [
      name,
      {
        touched: count.touched / total,
        affected: count.affected / total,
        affectedWithoutLockfile: count.affectedWithoutLockfile / total,
        affectedByGraph: count.affectedByGraph / total,
      },
    ]),
  );
  return { rates, globalCommits, lockfileCommits };
};

/**
 * The advisory thresholds a row exceeds. The affected check uses the
 * graph-only rate, so no project is flagged for the floor that global files
 * put under every project, and it skips rarely touched projects.
 *
 * @public
 */
export const flagRow = (
  row: Pick<CensusRow, 'sourceFiles' | 'testCases' | 'testSeconds' | 'rates'>,
  thresholds: typeof sizeThresholds = sizeThresholds,
): string[] => [
  ...(row.sourceFiles > thresholds.sourceFiles ? ['source-files'] : []),
  ...(row.testCases > thresholds.testCases ? ['test-cases'] : []),
  ...(row.testSeconds !== undefined && row.testSeconds > thresholds.testSeconds ? ['test-time'] : []),
  ...(row.rates.touched >= thresholds.minTouchedForAffected &&
  row.rates.affectedByGraph > thresholds.affectedToTouched * row.rates.touched
    ? ['affected-rate']
    : []),
];

/**
 * Assemble the report rows, sorted by number of flags, then source files.
 *
 * @public
 */
export const buildRows = (input: {
  readonly graph: CensusGraph;
  readonly sizes: ReadonlyMap<string, ProjectSize>;
  readonly rates: ReadonlyMap<string, ProjectRates>;
  readonly testSeconds?: Readonly<Record<string, number>>;
}): CensusRow[] => {
  const { graph, sizes, rates, testSeconds = {} } = input;
  const known = new Set(graph.projects.map(({ name }) => name));
  const dependencies = Object.fromEntries(
    graph.projects.map(({ name }) => [
      name,
      [...new Set(graph.dependencies[name] ?? [])].filter((target) => known.has(target) && target !== name),
    ]),
  );
  const dependents = reverseEdges(dependencies);
  const empty = { sourceFiles: 0, sourceLines: 0, testFiles: 0, testCases: 0 };
  const noRates = { touched: 0, affected: 0, affectedWithoutLockfile: 0, affectedByGraph: 0 };
  return graph.projects
    .map((project) => {
      const size = sizes.get(project.name) ?? empty;
      const row = {
        name: project.name,
        root: project.root,
        ...size,
        dependencies: dependencies[project.name]?.length ?? 0,
        closure: reach([project.name], dependencies).size - 1,
        dependents: dependents[project.name]?.length ?? 0,
        fanIn: reach([project.name], dependents).size - 1,
        testSeconds: project.hasTest ? testSeconds[project.name] : undefined,
        rates: rates.get(project.name) ?? noRates,
      };
      return { ...row, flags: flagRow(row) };
    })
    .sort((a, b) => b.flags.length - a.flags.length || b.sourceFiles - a.sourceFiles || a.name.localeCompare(b.name));
};

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/**
 * Render rows as an aligned plain-text table.
 *
 * @public
 */
export const renderTable = (report: CensusReport, options: { readonly all?: boolean } = {}): string => {
  const rows = options.all === true ? report.rows : report.rows.filter(({ flags }) => flags.length > 0);
  const header = [
    'project',
    'src',
    'loc',
    'tests',
    'cases',
    'test s',
    'deps',
    'closure',
    'fan-in',
    'touched',
    'affected',
    'no-lock',
    'graph',
    'flags',
  ];
  const body = rows.map((row) => [
    row.name,
    String(row.sourceFiles),
    String(row.sourceLines),
    String(row.testFiles),
    String(row.testCases),
    row.testSeconds === undefined ? '-' : String(Math.round(row.testSeconds)),
    String(row.dependencies),
    String(row.closure),
    String(row.fanIn),
    percent(row.rates.touched),
    percent(row.rates.affected),
    percent(row.rates.affectedWithoutLockfile),
    percent(row.rates.affectedByGraph),
    row.flags.join(','),
  ]);
  const widths = header.map((cell, column) => Math.max(cell.length, ...body.map((line) => line[column]?.length ?? 0)));
  const format = (line: readonly string[]): string =>
    line
      .map((cell, column) =>
        column === 0 || column === line.length - 1
          ? cell.padEnd(widths[column] ?? 0)
          : cell.padStart(widths[column] ?? 0),
      )
      .join('  ')
      .trimEnd();
  const flagged = report.rows.filter(({ flags }) => flags.length > 0).length;
  const { thresholds } = report;
  return [
    `Project census at ${report.ref}: ${report.rows.length} projects, ${report.commits} first-parent commits (${report.globalCommits} touch a global file, ${report.lockfileCommits} the lockfile).`,
    `Advisory thresholds: source files <= ${thresholds.sourceFiles}, test cases <= ${thresholds.testCases}, test <= ${thresholds.testSeconds} s, graph-affected <= ${thresholds.affectedToTouched} x touched (when touched >= ${percent(thresholds.minTouchedForAffected)}). ${flagged} project(s) over at least one.`,
    '',
    format(header),
    ...body.map((line) => format(line)),
  ].join('\n');
};
