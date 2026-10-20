/**
 * Viewer shell parity guard: the Tau app's viewer and the agent plugin's viewer page draw their shell from
 * `@taucad/workbench-panes`, not from copies of it.
 *
 * Each host file must import the shared composite it adopted (the stage, the part menu, the header actions and the
 * tab leaf), and the host trees must not grow back the code those composites replaced: the hover label's custom
 * properties, the secondary-gesture driver, the hover-name lookup, a hand-built Share or Export action, and
 * `fade-row` tab markup. It reads files as text, so it adds no dependency between the hosts and the package.
 *
 * Usage:
 *   node scripts/src/check-viewer-shell-parity.ts
 *
 * Exit codes:
 *   0  Every host adopts the shared shell
 *   1  A host misses a shared import or carries a replaced copy
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const panes = '@taucad/workbench-panes';

/** The shared composites each host file must import, by repository-relative path. */
export const requiredImports: Readonly<Record<string, readonly string[]>> = {
  'apps/ui/app/routes/w.$workspace.$project/chat-viewer.tsx': [
    `${panes}/shell/viewer-stage`,
    `${panes}/component-menu/use-viewer-part-menu`,
  ],
  'apps/ui/app/routes/w.$workspace.$project/project-workspace-actions.tsx': [`${panes}/shell/viewer-header-actions`],
  'apps/ui/app/components/panes/dockview-tab.tsx': [`${panes}/components/workbench-tab`],
  'packages/agent-plugin/app/viewer-page.tsx': [
    `${panes}/shell/viewer-stage`,
    `${panes}/component-menu/use-viewer-part-menu`,
    `${panes}/shell/viewer-header-actions`,
    `${panes}/components/workbench-tab`,
  ],
  'packages/agent-plugin/app/workbench-lane.tsx': [`${panes}/lane/pane-lane`],
};

/** The host source trees the replaced code must not return to. */
export const hostRoots: readonly string[] = ['apps/ui/app', 'packages/agent-plugin/app'];

/** A copy of shared shell code, and how to recognise it in a host's source text. */
type ForbiddenPattern = Readonly<{ name: string; test: (source: string) => boolean }>;

const matches =
  (pattern: RegExp): ForbiddenPattern['test'] =>
  (source) =>
    pattern.test(source);

/** What the shared composites replaced. Tests and specs may still name these, to assert on what the shell draws. */
export const forbiddenPatterns: readonly ForbiddenPattern[] = [
  { name: 'the hover label custom properties (--viewer-hover-label-*)', test: matches(/--viewer-hover-label-/u) },
  {
    name: 'beginViewerSecondaryGesture (the part menu gesture driver)',
    test: matches(/\bbeginViewerSecondaryGesture\b/u),
  },
  {
    name: 'completeViewerSecondaryGesture (the part menu gesture driver)',
    test: matches(/\bcompleteViewerSecondaryGesture\b/u),
  },
  {
    name: 'getModelInteractionUnitState(…).manifest?.nodesById[…].name (the hover name lookup)',
    test: matches(/getModelInteractionUnitState\([^;]*?\)\s*\??\.manifest\??\.nodesById\[[^\]]+\]\??\.name\b/u),
  },
  {
    name: 'a PaneAction for Share or Export (ViewerHeaderActions draws them)',
    test: matches(/<PaneAction\b(?:(?!<PaneAction\b|\/>)[\s\S]){0,600}?\blabel=\{?["'`](?:Share|Export)["'`]/u),
  },
  {
    name: 'fade-row tab markup (WorkbenchTab draws the tab leaf)',
    test: (source) =>
      /\bfade-row\b/u.test(source) &&
      /role=\{?["'`]tab["'`]|\bdv-default-tab\b|\bgroup\/(?:default-)?tab\b/u.test(source),
  },
];

const sourceFile = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|css)$/u;
const testFile = /(?:\.(?:test|spec|test-d)\.|\.test-utils\.|[/\\](?:e2e|__tests__|fixtures)[/\\])/u;
const skippedDirectories = new Set(['node_modules', 'dist', 'build', '.react-router', 'out-tsc', 'coverage']);

/**
 * Lists the production source files under one directory.
 *
 * @param root - The repository root.
 * @param directory - The repository-relative directory to walk.
 * @returns Repository-relative paths, sorted.
 */
export const listHostSources = (root: string, directory: string): string[] => {
  const found: string[] = [];
  const walk = (absolute: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          walk(path);
        }
        continue;
      }
      const relativePath = relative(root, path).split('\\').join('/');
      if (entry.isFile() && sourceFile.test(entry.name) && !testFile.test(`/${relativePath}`)) {
        found.push(relativePath);
      }
    }
  };
  walk(resolve(root, directory));
  return found.toSorted();
};

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);

const importsModule = (source: string, specifier: string): boolean =>
  new RegExp(String.raw`^\s*import\b[^;]*?\bfrom\s+["']${escapeRegExp(specifier)}["']`, 'mu').test(source);

/**
 * Checks host sources against the parity rules.
 *
 * @param sources - Source text by repository-relative path: every file in {@link requiredImports}, and the host files
 *   to scan for {@link forbiddenPatterns}.
 * @returns One line per violation; empty when every host adopts the shared shell.
 */
export const checkViewerShellParity = (sources: ReadonlyMap<string, string>): string[] => {
  const violations: string[] = [];
  for (const [path, specifiers] of Object.entries(requiredImports)) {
    const source = sources.get(path);
    if (source === undefined) {
      violations.push(`${path}: missing; the guard names it, so move the guard with the file`);
      continue;
    }
    for (const specifier of specifiers) {
      if (!importsModule(source, specifier)) {
        violations.push(`${path}: does not import ${specifier}`);
      }
    }
  }
  for (const [path, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${path}: carries ${pattern.name}`);
      }
    }
  }
  return violations;
};

/**
 * Reads the host files from a checkout.
 *
 * @param root - The repository root.
 * @returns Source text by repository-relative path; a required file that does not exist is left out.
 */
export const readHostSources = (root: string): Map<string, string> => {
  const paths = new Set(hostRoots.flatMap((directory) => listHostSources(root, directory)));
  const sources = new Map<string, string>();
  for (const path of [...Object.keys(requiredImports), ...paths]) {
    try {
      sources.set(path, readFileSync(resolve(root, path), 'utf8'));
    } catch {
      /* A required file that moved is reported as missing. */
    }
  }
  return sources;
};

/**
 * Runs the guard on a checkout and reports the outcome.
 *
 * @param root - The repository root.
 * @param log - Where the outcome goes: `error` for violations, `info` for a pass.
 * @returns The exit code: 0 on a pass, 1 with violations.
 */
export const runViewerShellParity = (
  root: string,
  log: Readonly<{ error: (message: string) => void; info: (message: string) => void }>,
): number => {
  const sources = readHostSources(root);
  const violations = checkViewerShellParity(sources);
  if (violations.length > 0) {
    log.error(`The viewer shell is shared from ${panes}; these hosts drifted from it:\n  ${violations.join('\n  ')}`);
    return 1;
  }
  log.info(`Every viewer host draws the shared shell (${String(sources.size)} files checked).`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runViewerShellParity(resolve(import.meta.dirname, '../..'), {
    error: (message) => {
      console.error(message);
    },
    info: (message) => {
      console.log(message);
    },
  });
}
