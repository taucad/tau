/**
 * Reject unexpected untracked entries at the Tau workspace root after tooling runs.
 *
 * Authored roots come from Git. Stable machine roots and persistent workspace
 * exceptions come from docs/policy/tool-output-location-policy.md.
 *
 * Usage: pnpm nx run scripts:validate-workspace-root
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

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

const main = (): void => {
  const workspaceRoot = resolve(import.meta.dirname, '../..');
  const trackedPaths = execFileSync('git', ['ls-files', '-z'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const unexpected = unexpectedWorkspaceRootEntries({
    actualEntries: readdirSync(workspaceRoot),
    trackedPaths,
  });

  if (unexpected.length > 0) {
    throw new Error(`Unexpected workspace-root entries:\n${unexpected.map((entry) => `  - ${entry}`).join('\n')}`);
  }

  console.log('✓ workspace root contains no unexpected generated entries');
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
