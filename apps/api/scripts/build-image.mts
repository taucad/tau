#!/usr/bin/env node
/**
 * Build the API and its command bundles inside the Linux deploy image.
 * `api:build` inherits `^build`, and the API's GeoSpec test harness devDependency makes that include
 * `geospec-engine-native:build`, a gate on the Darwin ARM64 artifact transport that no image build has.
 * The runtime image never loads the native engine, so this builds every other dependency through Nx,
 * then the API without task dependencies. It refuses to run if the native engine becomes a runtime dependency
 * or another dependency starts requiring its build.
 * Required env: none.
 * Usage: node apps/api/scripts/build-image.mts (from the Dockerfile build stage)
 * Exit codes: 0 built, 1 graph precondition or build failure.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const repoRoot = resolve(import.meta.dirname, '../../..');
const nativeBuild = 'geospec-engine-native:build';

type TaskGraph = { tasks: { tasks: Record<string, unknown>; dependencies: Record<string, string[]> } };

const nxBin = join(repoRoot, 'node_modules/.bin/nx');

/* Nx 22.7.1 intermittently segfaults before it runs anything, as the CI setup
 * (`.github/actions/setup-nx`) records; the Dockerfile also turns off its native PTY
 * runner. Call the bin directly, so the signal reaches this process instead of pnpm's
 * exit 1, then rerun once on SIGSEGV and pass every other outcome through. */
const nx = (...args: string[]): void => {
  const run = () => spawnSync(nxBin, args, { cwd: repoRoot, stdio: 'inherit' });
  let result = run();
  if (result.signal === 'SIGSEGV') {
    console.warn(`Nx was killed by SIGSEGV; rerunning: nx ${args.join(' ')}`);
    result = run();
  }
  if (result.status !== 0) {
    throw new Error(`nx ${args.join(' ')} exited with ${result.status ?? result.signal}`);
  }
};

const main = (): void => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'apps/api/package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  if (manifest.dependencies?.['@taucad/geospec-engine-native']) {
    throw new Error('@taucad/geospec-engine-native is an API runtime dependency; the image needs its artifacts');
  }

  const directory = mkdtempSync(join(tmpdir(), 'api-image-graph-'));
  let graph: TaskGraph;
  try {
    const graphPath = join(directory, 'graph.json');
    nx('build', 'api', `--graph=${graphPath}`);
    graph = JSON.parse(readFileSync(graphPath, 'utf8')) as TaskGraph;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const nativeDependents = Object.entries(graph.tasks.dependencies)
    .filter(([task, dependencies]) => task !== 'api:build' && dependencies.includes(nativeBuild))
    .map(([task]) => task);
  if (nativeDependents.length > 0) {
    throw new Error(`${nativeDependents.join(', ')} require ${nativeBuild}; the image cannot skip it`);
  }

  const projects = Object.keys(graph.tasks.tasks)
    .filter((task) => task.endsWith(':build') && task !== 'api:build' && task !== nativeBuild)
    .map((task) => task.slice(0, -':build'.length));
  nx('run-many', '-t', 'build', '-p', projects.join(','));
  for (const target of ['api:build', 'api:build:billing-command', 'api:build:maintenance-command']) {
    nx('run', target, '--exclude-task-dependencies');
  }
};

try {
  main();
} catch (error) {
  console.error('API image build failed:', error);
  process.exit(1);
}
