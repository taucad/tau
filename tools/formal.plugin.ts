/**
 * NX Plugin for formal verification targets.
 *
 * Infers a project's `formal` and `formal:lean` targets from the spec directories
 * under `{projectRoot}/specs/`, the directories `node tools/formal/src/cli.ts check`
 * reads (`findExpectedFiles` in tools/formal/src/expected.ts). A directory counts
 * only when its `expected.json` sits beside the marker of the language it checks:
 *
 * - a `lean-toolchain` file and an `expected.json` with a `lean` section is a Lean
 *   directory, checked by `check --tier lean` → `formal:lean`;
 * - at least one `*.tla` file and an `expected.json` without a `lean` section is a
 *   TLA+ directory, checked by `check --tier pr` → `formal`.
 *
 * Any other `expected.json` is ignored. `expected.json` is a generic name that
 * other tools use too (packages/plugins/openrscad/src/fixtures/edge-topology/
 * holds one), so the name alone must never give a project a formal target.
 * `scripts/src/formal-plugin-target.test.ts` fails when a tracked spec directory
 * has a marker without an `expected.json`, or an `expected.json` whose `lean`
 * section disagrees with its markers, so an ignored file cannot go unnoticed.
 *
 * The glob matches the markers as well as `expected.json`, so every file the rule
 * reads is a matched file: Nx re-runs inference when one is added or removed, and
 * the plugin reads sibling markers from the matched list instead of the disk.
 *
 * The plugin decides only which projects carry a target. The command, inputs,
 * outputs and cache settings stay in `nx.json` `targetDefaults`, beside
 * `formal:nightly` and `formal:logs`, so every formal tier is configured in one
 * place and an explicit project.json target still overrides the inferred one.
 *
 * `formal:nightly` and `formal:logs` are not inferred: which projects run them is
 * an owner's choice the files do not record (a project with an exported graph or
 * Lean proofs may still be left out of the nightly run), so they stay explicit in
 * project.json.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2 } from '@nx/devkit';

/** The part of an `expected.json` this plugin reads: whether it describes Lean proofs. */
type ExpectedFile = { lean?: unknown };

/** The files of one spec directory that the rule reads. */
export type SpecDirectory = {
  /** Workspace-relative path of the directory's `expected.json`, when it has one. */
  expected?: string;
  /** Whether the directory holds a `lean-toolchain` file. */
  leanToolchain: boolean;
  /** Whether the directory holds at least one `*.tla` file. */
  tla: boolean;
};

/** Directory segments that hold test fixtures, never a project's own specs. */
const fixtureSegments = new Set(['fixtures', '__fixtures__']);

/**
 * The project root that owns an `expected.json`: the directory above its first
 * `specs` segment, as long as it is a project and no segment is a fixture
 * directory. `formal check <projectRoot>` reads every `expected.json` under
 * `<projectRoot>/specs`, nested or not.
 */
export const formalProjectRoot = (expectedFile: string, workspaceRoot: string): string | undefined => {
  const segments = expectedFile.split(/[/\\]/);
  const specs = segments.indexOf('specs');
  if (specs <= 0 || segments.slice(0, -1).some((segment) => fixtureSegments.has(segment))) {
    return undefined;
  }
  const projectRoot = segments.slice(0, specs).join('/');
  return existsSync(join(workspaceRoot, projectRoot, 'project.json')) ? projectRoot : undefined;
};

/** Groups matched files by directory, recording the markers each directory holds. */
export const specDirectories = (files: readonly string[]): Map<string, SpecDirectory> => {
  const directories = new Map<string, SpecDirectory>();
  for (const file of files) {
    const separator = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    const directory = file.slice(0, separator);
    const name = file.slice(separator + 1);
    const entry = directories.get(directory) ?? {
      leanToolchain: false,
      tla: false,
    };
    if (name === 'expected.json') {
      entry.expected = file;
    } else if (name === 'lean-toolchain') {
      entry.leanToolchain = true;
    } else if (name.endsWith('.tla')) {
      entry.tla = true;
    }
    directories.set(directory, entry);
  }
  return directories;
};

/** The target a spec directory gives its project, or undefined when its markers do not match. */
export const formalTargetName = (
  directory: SpecDirectory,
  expected: ExpectedFile,
): 'formal' | 'formal:lean' | undefined => {
  if (expected.lean !== undefined) {
    return directory.leanToolchain ? 'formal:lean' : undefined;
  }
  return directory.tla ? 'formal' : undefined;
};

const createFormalTarget = (directory: SpecDirectory, workspaceRoot: string): CreateNodesResult | undefined => {
  if (directory.expected === undefined || (!directory.leanToolchain && !directory.tla)) {
    return undefined;
  }
  const projectRoot = formalProjectRoot(directory.expected, workspaceRoot);
  if (projectRoot === undefined) {
    return undefined;
  }
  const targetName = formalTargetName(directory, readJsonFile<ExpectedFile>(join(workspaceRoot, directory.expected)));
  return targetName === undefined ? undefined : { projects: { [projectRoot]: { targets: { [targetName]: {} } } } };
};

export const createNodesV2: CreateNodesV2 = [
  '**/specs/**/{expected.json,lean-toolchain,*.tla}',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (files, _options, context) => {
    const results: Array<[string, CreateNodesResult]> = [];
    for (const directory of specDirectories(files).values()) {
      const target = createFormalTarget(directory, context.workspaceRoot);
      if (target && directory.expected !== undefined) {
        results.push([directory.expected, target]);
      }
    }
    return results;
  },
];
