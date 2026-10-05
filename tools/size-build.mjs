/**
 * Discovers all projects with .size-limit.json, builds them via Nx,
 * and writes a merged config below node_modules/.cache for size-limit to consume.
 *
 * Used by size-limit-action in CI to produce a single consolidated PR comment
 * across all packages with size budgets.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const sizeLimitRoot = join(workspaceRoot, 'node_modules', '.cache', 'size-limit');
const mergedConfigPath = join(sizeLimitRoot, '.size-limit.json');

function getProjectRoots() {
  // One graph read for every project root, instead of one `nx show project` per project.
  const graphPath = join(sizeLimitRoot, 'graph.json');
  mkdirSync(sizeLimitRoot, { recursive: true });
  execFileSync('pnpm', ['nx', 'graph', `--file=${graphPath}`], {
    cwd: workspaceRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const { nodes } = JSON.parse(readFileSync(graphPath, 'utf8')).graph;
  const results = [];

  for (const [project, { data }] of Object.entries(nodes)) {
    const configPath = join(workspaceRoot, data.root, '.size-limit.json');
    if (existsSync(configPath)) {
      results.push({ project, root: data.root, configPath });
    }
  }

  return results;
}

function prefixPath(root, p) {
  if (p.startsWith('!')) {
    return `!${resolve(workspaceRoot, root, p.slice(1))}`;
  }
  return resolve(workspaceRoot, root, p);
}

const projects = getProjectRoots();

if (projects.length === 0) {
  throw new Error('No projects with .size-limit.json found');
}

// One Nx invocation builds them all, so shared dependencies build once and the task
// runner orders them; `--parallel=1` keeps the hosted runner within its memory.
console.log(`Building ${projects.map(({ project }) => project).join(', ')}...`);
execFileSync(
  'pnpm',
  ['nx', 'run-many', '-t', 'build', `--projects=${projects.map(({ project }) => project).join(',')}`, '--parallel=1'],
  { cwd: workspaceRoot, stdio: 'inherit' },
);

const merged = [];

for (const { project, root, configPath } of projects) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  for (const entry of config) {
    const prefixed = {
      ...entry,
      name: `${project}: ${entry.name}`,
    };

    if (Array.isArray(entry.path)) {
      prefixed.path = entry.path.map((p) => prefixPath(root, p));
    } else {
      prefixed.path = prefixPath(root, entry.path);
    }

    merged.push(prefixed);
  }
}

mkdirSync(sizeLimitRoot, { recursive: true });
writeFileSync(mergedConfigPath, JSON.stringify(merged, null, 2));
console.log(`Merged ${merged.length} size-limit entries from ${projects.length} project(s)`);
