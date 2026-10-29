/** Plan exactly three CI test shards from a reviewed offline duration snapshot. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

type Environment = { runner: string; nodeMajor: number; nxVersion: string };
type ProjectWeight = { name: string; fileWeight: number };
type Observation = {
  project: string;
  /** Elapsed uncached task time, milliseconds. */
  duration: number;
  observedAt: string;
  outcome: 'success';
  cache: 'miss';
  run: string;
  job: string;
  sourceRevision: string;
};
export type ShardPlan = {
  schemaVersion: 1;
  identity: string;
  strategy: 'duration' | 'file-count';
  reason: string;
  selected: string[];
  weights: Record<string, number>;
  shards: string[][];
  loads: number[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const compareNames = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const validName = (name: string): boolean => /^[a-zA-Z0-9][\w-]*$/u.test(name);
const observation = (value: unknown, now: number): value is Observation => {
  if (!isRecord(value)) {
    return false;
  }
  const observed = typeof value['observedAt'] === 'string' ? Date.parse(value['observedAt']) : Number.NaN;
  return (
    typeof value['project'] === 'string' &&
    validName(value['project']) &&
    typeof value['duration'] === 'number' &&
    Number.isFinite(value['duration']) &&
    value['duration'] > 0 &&
    Number.isFinite(observed) &&
    observed <= now &&
    now - observed <= 14 * 24 * 60 * 60 * 1000 &&
    value['outcome'] === 'success' &&
    value['cache'] === 'miss' &&
    typeof value['run'] === 'string' &&
    value['run'].length > 0 &&
    typeof value['job'] === 'string' &&
    value['job'].length > 0 &&
    typeof value['sourceRevision'] === 'string' &&
    /^[a-f\d]{40}$/u.test(value['sourceRevision'])
  );
};

/** The full file-count fallback avoids mixing seconds with counts or omitting unseen projects. */
export const planTestShards = (options: {
  projects: ProjectWeight[];
  history: unknown;
  environment: Environment;
  now: number;
}): ShardPlan => {
  const projects = [...options.projects].sort((a, b) => compareNames(a.name, b.name));
  const selected = projects.map((p) => p.name);
  for (const p of projects) {
    if (!validName(p.name) || !Number.isSafeInteger(p.fileWeight) || p.fileWeight < 1) {
      throw new Error(`Invalid project weight: ${p.name}`);
    }
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error('Selected projects contain a duplicate');
  }
  const { history, environment } = options;
  const compatible =
    isRecord(history) &&
    history['schemaVersion'] === 1 &&
    isRecord(history['environment']) &&
    history['environment']['runner'] === environment.runner &&
    history['environment']['nodeMajor'] === environment.nodeMajor &&
    history['environment']['nxVersion'] === environment.nxVersion &&
    Array.isArray(history['samples']);
  const samples =
    compatible && isRecord(history) && Array.isArray(history['samples'])
      ? history['samples'].filter((s): s is Observation => observation(s, options.now))
      : [];
  const durations: Record<string, number> = {};
  for (const project of selected) {
    const unique = new Map<string, Observation>();
    for (const sample of samples.filter((s) => s.project === project)) {
      unique.set(`${sample.run}:${sample.job}`, sample);
    }
    const recent = [...unique.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 5);
    const values = recent.map((s) => s.duration).sort((a, b) => a - b);
    if (values.length > 0) {
      durations[project] = (values[Math.floor((values.length - 1) / 2)]! + values[Math.floor(values.length / 2)]!) / 2;
    }
  }
  const missing = selected.filter((project) => durations[project] === undefined);
  const strategy = compatible && missing.length === 0 ? 'duration' : 'file-count';
  const reason =
    strategy === 'duration'
      ? 'Median of up to five recent successful uncached observations per selected target'
      : compatible
        ? `No recent uncached timing: ${missing.join(', ')}`
        : 'Missing or incompatible timing snapshot';
  const weights = Object.fromEntries(
    projects.map((p) => [p.name, strategy === 'duration' ? durations[p.name]! : p.fileWeight]),
  );
  const shards: string[][] = [[], [], []];
  const loads = [0, 0, 0];
  for (const project of [...selected].sort((a, b) => weights[b]! - weights[a]! || compareNames(a, b))) {
    let best = 0;
    for (let i = 1; i < 3; i++) {
      if (loads[i]! < loads[best]!) {
        best = i;
      }
    }
    shards[best]!.push(project);
    loads[best]! += weights[project]!;
  }
  const payload: Omit<ShardPlan, 'identity'> = { schemaVersion: 1, strategy, reason, selected, weights, shards, loads };
  return { ...payload, identity: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
};

const repoRoot = resolve(import.meta.dirname, '../..');
const main = (): void => {
  const { values } = parseArgs({
    options: {
      selection: { type: 'string' },
      'project-graph': { type: 'string' },
      history: { type: 'string', default: 'scripts/ci-test-durations.json' },
      output: { type: 'string', default: 'out/reports/ci/test-shards.json' },
    },
  });
  if (!values.selection || !values['project-graph']) {
    throw new Error(
      'Usage: --selection <selected.json> --project-graph <nx-graph.json> [--history <snapshot.json>] [--output <manifest.json>]',
    );
  }
  const selected: unknown = JSON.parse(readFileSync(resolve(repoRoot, values.selection), 'utf8'));
  const graph: unknown = JSON.parse(readFileSync(resolve(repoRoot, values['project-graph']), 'utf8'));
  if (!Array.isArray(selected) || !selected.every((p): p is string => typeof p === 'string' && validName(p))) {
    throw new Error('Invalid selected test projects');
  }
  if (!isRecord(graph) || !isRecord(graph['graph']) || !isRecord(graph['graph']['nodes'])) {
    throw new Error('Invalid Nx graph');
  }
  const { nodes } = graph['graph'];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' }).split('\0');
  const projects = selected.map((name) => {
    const node = nodes[name];
    if (
      !isRecord(node) ||
      !isRecord(node['data']) ||
      typeof node['data']['root'] !== 'string' ||
      !isRecord(node['data']['targets']) ||
      !node['data']['targets']['test']
    ) {
      throw new Error(`Missing test project in graph: ${name}`);
    }
    const { root, tags } = node['data'];
    if (Array.isArray(tags) && (tags.includes('scope:api') || tags.includes('ci:quarantined'))) {
      throw new Error(`Excluded project in test selection: ${name}`);
    }
    const fileWeight =
      root === '.'
        ? 1
        : tracked.filter(
            (path) => path.startsWith(`${root}/`) && /(\.(test|spec)\.[cm]?[jt]sx?|Tests?\.cs)$/u.test(path),
          ).length + 1;
    return { name, fileWeight };
  });
  let history: unknown;
  try {
    history = JSON.parse(readFileSync(resolve(repoRoot, values.history), 'utf8'));
  } catch {
    history = undefined;
  }
  const nx = JSON.parse(readFileSync(resolve(repoRoot, 'node_modules/nx/package.json'), 'utf8')) as { version: string };
  const plan = planTestShards({
    projects,
    history,
    now: Date.now(),
    environment: {
      runner:
        process.env['RUNNER_OS'] === 'Linux' && process.env['RUNNER_ARCH'] === 'X64'
          ? 'ubuntu-latest'
          : `${process.platform}-${process.arch}`,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      nxVersion: nx.version,
    },
  });
  const output = resolve(repoRoot, values.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(plan, undefined, 2) + '\n');
  if (process.env['GITHUB_OUTPUT']) {
    appendFileSync(
      process.env['GITHUB_OUTPUT'],
      `test-shards=${JSON.stringify(plan.shards)}\ntest-shards-id=${plan.identity}\n`,
    );
  }
  console.log(`Test assignment ${plan.identity}: ${plan.strategy}. ${plan.reason}`);
  for (const [i, shard] of plan.shards.entries()) {
    console.log(`test-${i + 1}: ${shard.join(',') || '(empty)'}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error('Test shard planning failed:', error);
    process.exitCode = 1;
  }
}
