#!/usr/bin/env node
/**
 * Build the API and its command bundles inside the Linux deploy image.
 * This builds every `^build` dependency of `api:build` through Nx, then the API targets without task
 * dependencies. The runtime image never loads the GeoSpec engine (`geospec-engine`, a test-harness
 * devDependency installed from npm), so the script refuses to run if it becomes an API runtime dependency.
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
  if (manifest.dependencies?.['geospec-engine']) {
    throw new Error('geospec-engine is an API runtime dependency; the image does not carry its native binding');
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

  const projects = Object.keys(graph.tasks.tasks)
    .filter((task) => task.endsWith(':build') && task !== 'api:build')
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
