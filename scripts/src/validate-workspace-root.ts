/**
 * Enforce the approved authored roots and reject unexpected local entries after tooling runs.
 *
 * The authored inventory comes from Git and must match the reviewed root layout.
 * Stable machine roots and persistent workspace exceptions come from
 * docs/policy/tool-output-location-policy.md.
 *
 * Usage: pnpm nx run scripts:validate-workspace-root
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const authoredRoots = [
  '.agents',
  '.claude',
  '.codex',
  '.github',
  '.gitignore',
  '.nx',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  '.vscode',
  'AGENTS.md',
  'CLAUDE.md',
  'NOTICE',
  'apps',
  'docs',
  'eslint.config.mjs',
  'examples',
  'infra',
  'libs',
  'license',
  'nx.json',
  'package.json',
  'packages',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'readme.md',
  'scripts',
  'tools',
  'tsconfig.json',
] as const;

const stableUntrackedRoots = ['.git', '.nx', 'node_modules', 'out', 'out-tsc', 'repos'] as const;

type WorkspaceRootInventory = {
  readonly actualEntries: readonly string[];
  readonly trackedPaths: readonly string[];
};

export const unexpectedWorkspaceRootEntries = ({ actualEntries, trackedPaths }: WorkspaceRootInventory): string[] => {
  const allowed = new Set<string>(stableUntrackedRoots);
  for (const path of trackedPaths) {
    const [rootEntry] = path.split('/');
    if (rootEntry) {
      allowed.add(rootEntry);
    }
  }

  return actualEntries.filter((entry) => !allowed.has(entry)).sort();
};

export const workspaceRootInventoryErrors = (inventory: WorkspaceRootInventory): string[] => {
  const trackedRoots = new Set(inventory.trackedPaths.map((path) => path.split('/')[0] ?? '').filter(Boolean));
  const approved = new Set<string>(authoredRoots);
  const unexpectedAuthored = [...trackedRoots].filter((entry) => !approved.has(entry)).sort();
  // Nx release consumes version plans, so .nx can have no tracked files after a release.
  const missingAuthored = authoredRoots.filter((entry) => entry !== '.nx' && !trackedRoots.has(entry)).sort();
  const unexpectedLocal = unexpectedWorkspaceRootEntries(inventory);
  return [
    ...unexpectedAuthored.map((entry) => `Unapproved authored root: ${entry}`),
    ...missingAuthored.map((entry) => `Missing approved authored root: ${entry}`),
    ...unexpectedLocal.map((entry) => `Unexpected local root: ${entry}`),
  ];
};

const main = (): void => {
  const workspaceRoot = resolve(import.meta.dirname, '../..');
  const trackedPaths = execFileSync('git', ['ls-files', '-z'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const errors = workspaceRootInventoryErrors({
    actualEntries: readdirSync(workspaceRoot),
    trackedPaths,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid workspace-root inventory:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  console.log('✓ workspace root matches the approved authored layout with no unexpected local roots');
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
