/**
 * `nx run nx:census`: the project size census and simulated affected rates.
 * Advisory, local, and offline: it reads the Nx project graph, `git ls-files`
 * and `git log`, writes the full report as JSON, and prints a table of the
 * projects over the workspace project policy's size target. It always exits 0.
 *
 *   --commits <n>      first-parent commits to replay (default 500)
 *   --ref <rev>        history tip (default HEAD)
 *   --out <path>       JSON report path (default out/reports/census/census.json)
 *   --durations <path> JSON object of project name to uncached `test` seconds
 *   --all              print every project, not only flagged ones
 *   --json             print the JSON report instead of the table
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createProjectGraphAsync, workspaceRoot } from '#devkit.js';
import {
  countLines,
  countsTestCases,
  countTestCases,
  isSourceFile,
  sizeProjects,
  sizeThresholds,
  simulateRates,
  buildRows,
  renderTable,
} from '#census.js';
import type { CensusGraph, CensusReport, CommitTouches, FileFacts } from '#census.js';

const { values } = parseArgs({
  options: {
    commits: { type: 'string', default: '500' },
    ref: { type: 'string', default: 'HEAD' },
    out: { type: 'string', default: 'out/reports/census/census.json' },
    durations: { type: 'string' },
    all: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });

const nxGraph = await createProjectGraphAsync({ exitOnError: true });
const graph: CensusGraph = {
  projects: Object.values(nxGraph.nodes)
    .map((node) => ({ name: node.name, root: node.data.root, hasTest: node.data.targets?.['test'] !== undefined }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  dependencies: Object.fromEntries(
    Object.entries(nxGraph.dependencies).map(([source, edges]) => [source, edges.map(({ target }) => target)]),
  ),
};

const files: FileFacts[] = git('ls-files', '-z')
  .split('\0')
  .filter((path) => path.length > 0)
  .flatMap((path) => {
    if (countsTestCases(path)) {
      return [{ path, testCases: countTestCases(readFileSync(join(workspaceRoot, path), 'utf8')) }];
    }

    if (isSourceFile(path)) {
      return [{ path, lines: countLines(readFileSync(join(workspaceRoot, path), 'utf8')) }];
    }

    return [{ path }];
  });

const commits: CommitTouches[] = git(
  'log',
  '--first-parent',
  '--diff-merges=first-parent',
  '--no-renames',
  '--name-only',
  '--format=%x00%H',
  `--max-count=${Number.parseInt(values.commits, 10)}`,
  values.ref,
)
  .split('\0')
  .filter((chunk) => chunk.trim().length > 0)
  .map((chunk) => {
    const [sha = '', ...paths] = chunk.split('\n').filter((line) => line.length > 0);
    return { sha, files: paths };
  });

const nxJson = JSON.parse(readFileSync(join(workspaceRoot, 'nx.json'), 'utf8')) as {
  namedInputs?: { sharedGlobals?: string[] };
};
const shared = (nxJson.namedInputs?.sharedGlobals ?? [])
  .filter((input) => input.startsWith('{workspaceRoot}/'))
  .map((input) => input.slice('{workspaceRoot}/'.length));

const { rates, globalCommits, lockfileCommits } = simulateRates(graph, commits, {
  shared,
  lockfiles: ['pnpm-lock.yaml'],
});

const testSeconds =
  values.durations === undefined
    ? undefined
    : (JSON.parse(readFileSync(resolve(values.durations), 'utf8')) as Record<string, number>);

const report: CensusReport = {
  generatedAt: new Date().toISOString(),
  ref: git('rev-parse', '--short', values.ref).trim(),
  commits: commits.length,
  globalCommits,
  lockfileCommits,
  thresholds: sizeThresholds,
  rows: buildRows({
    graph,
    sizes: sizeProjects(graph.projects, files),
    rates,
    ...(testSeconds ? { testSeconds } : {}),
  }),
};

const out = resolve(workspaceRoot, values.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, undefined, 2)}\n`);
process.stdout.write(
  values.json
    ? `${JSON.stringify(report, undefined, 2)}\n`
    : `${renderTable(report, { all: values.all })}\n\nJSON report: ${out}\n`,
);
