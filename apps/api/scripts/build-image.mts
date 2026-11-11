#!/usr/bin/env node
/**
 * Build the API and its command bundles inside the Linux deploy image.
 * This builds every `^build` dependency of `api:build` through Nx, then the API targets without task
 * dependencies. The runtime image never loads the GeoSpec engine (`geospec-engine`, a native add-on
 * installed from npm), so the script refuses to run if it becomes an API runtime dependency.
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
const nxGuard = join(repoRoot, '.github/actions/setup-nx/nx-guard.ts');

/* Every Nx call goes through CI's guard (`.github/actions/setup-nx/nx-guard.ts`, kept in the build context by
 * `apps/api/Dockerfile.dockerignore`). It reruns once when Nx segfaults before it runs anything, and points Nx at a
 * local relay to the remote cache, so an unreachable cache or a refused entry costs a miss, not a failed command. It
 * reruns with the remote cache off only when Nx fails on one of its own remote cache errors; any other failure, such
 * as a compile error, fails the build the first time. Without a remote cache the guard runs Nx unchanged. */
const nx = (...args: string[]): void => {
  const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', nxGuard, nxBin, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
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
  for (const target of [
    'api:build',
    'api:build:billing-command',
    'api:build:maintenance-command',
    'api:build:mirror-command',
    'api:build:storage-worker',
  ]) {
    nx('run', target, '--exclude-task-dependencies');
  }
};

try {
  main();
} catch (error) {
  console.error('API image build failed:', error);
  process.exit(1);
}
