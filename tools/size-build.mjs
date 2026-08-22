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
  const output = execFileSync('pnpm', ['nx', 'show', 'projects', '--json'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const projects = JSON.parse(output.trim().split('\n').pop());
  const results = [];

  for (const project of projects) {
    const info = execFileSync('pnpm', ['nx', 'show', 'project', project, '--json'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const { root } = JSON.parse(info);
    const configPath = join(workspaceRoot, root, '.size-limit.json');
    if (existsSync(configPath)) {
      results.push({ project, root, configPath });
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

const merged = [];

for (const { project, root, configPath } of projects) {
  console.log(`Building ${project}...`);
  execFileSync('pnpm', ['nx', 'build', project], { cwd: workspaceRoot, stdio: 'inherit' });

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
